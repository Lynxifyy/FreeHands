#include "freehands/scrcpy_bridge.h"

#include <chrono>
#include <mutex>
#include <utility>

namespace freehands {

namespace {
constexpr int kDrainTimeoutMs = 20;
}  // namespace

ScrcpyBridge::ScrcpyBridge() : ScrcpyBridge(Config{}) {}

ScrcpyBridge::ScrcpyBridge(Config config)
    : config_(config),
      quality_(AdaptiveQuality::Config{config.latency_budget_ms}),
      latency_(config.latency_budget_ms),
      queue_(std::make_unique<FrameQueue>(config.queue_capacity)),
      parser_(std::make_unique<H264Parser>()),
      running_(false),
      stop_requested_(false),
      frames_captured_(0),
      sequence_(0) {}

ScrcpyBridge::~ScrcpyBridge() { stop(); }

bool ScrcpyBridge::start() {
  if (running_.load()) {
    return true;
  }
  stop_requested_.store(false);
  queue_ = std::make_unique<FrameQueue>(config_.queue_capacity);
  parser_ = std::make_unique<H264Parser>();
  running_.store(true);
  thread_ = std::thread(&ScrcpyBridge::runLoop, this);
  return true;
}

void ScrcpyBridge::stop() {
  if (!running_.load() && !thread_.joinable()) {
    return;
  }
  stop_requested_.store(true);
  if (queue_) {
    queue_->close();
  }
  if (thread_.joinable()) {
    thread_.join();
  }
  running_.store(false);
}

void ScrcpyBridge::runLoop() {
  while (!stop_requested_.load()) {
    EncodedFrame frame;
    if (!queue_->pop(frame, kDrainTimeoutMs)) {
      continue;
    }
    FrameSink sink;
    {
      std::lock_guard<std::mutex> lock(sink_mutex_);
      sink = sink_;
    }
    if (!sink) {
      // No consumer yet (or the consumer was cleared): drop rather than
      // buffer, so a stalled transport cannot grow memory without bound.
      continue;
    }
    const auto start = std::chrono::steady_clock::now();
    const bool accepted = sink(frame);
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                             std::chrono::steady_clock::now() - start)
                             .count();
    latency_.record(LatencyBudget::kTransmit, elapsed);
    quality_.observe(elapsed);
    if (!accepted) {
      std::lock_guard<std::mutex> lock(error_mutex_);
      last_error_ = "sink rejected frame";
    }
  }
}

bool ScrcpyBridge::pushFrame(const RawFrame& frame) {
  if (!running_.load()) {
    std::lock_guard<std::mutex> lock(error_mutex_);
    last_error_ = "bridge not running";
    return false;
  }
  if (frame.data == nullptr || frame.length == 0) {
    std::lock_guard<std::mutex> lock(error_mutex_);
    last_error_ = "empty frame";
    return false;
  }

  EncodedFrame encoded;
  encoded.data.assign(frame.data, frame.data + frame.length);
  encoded.sequence = sequence_.fetch_add(1);
  encoded.capture_ts_us = frame.capture_ts_us;
  encoded.keyframe = frame.keyframe;
  encoded.width = frame.width > 0 ? frame.width : config_.width;
  encoded.height = frame.height > 0 ? frame.height : config_.height;
  const AdaptiveQuality::Settings settings = quality_.settings();
  encoded.bitrate_kbps = settings.bitrate_kbps;
  if (frame.width <= 0 || frame.height <= 0) {
    encoded.width = settings.width;
    encoded.height = settings.height;
  }

  if (!queue_->push(std::move(encoded))) {
    return false;
  }
  frames_captured_.fetch_add(1);
  return true;
}

size_t ScrcpyBridge::pushEncodedChunk(const uint8_t* data, size_t length,
                                      int64_t capture_ts_us) {
  if (!running_.load()) {
    std::lock_guard<std::mutex> lock(error_mutex_);
    last_error_ = "bridge not running";
    return 0;
  }
  std::vector<NalUnit> units;
  parser_->append(data, length, units);
  size_t accepted = 0;
  for (const NalUnit& unit : units) {
    RawFrame frame;
    frame.data = parser_->bufferData() + unit.offset;
    frame.length = unit.length;
    frame.capture_ts_us = capture_ts_us;
    frame.keyframe = unit.keyframe;
    if (pushFrame(frame)) {
      ++accepted;
    }
  }
  return accepted;
}

size_t ScrcpyBridge::flushParser(int64_t capture_ts_us) {
  if (!running_.load()) {
    return 0;
  }
  // flush() clears the parser buffer, so keep a copy to read payloads from.
  const std::vector<uint8_t> snapshot = parser_->snapshot();
  std::vector<NalUnit> units;
  parser_->flush(units);
  size_t accepted = 0;
  for (const NalUnit& unit : units) {
    RawFrame frame;
    frame.data = snapshot.data() + unit.offset;
    frame.length = unit.length;
    frame.capture_ts_us = capture_ts_us;
    frame.keyframe = unit.keyframe;
    if (pushFrame(frame)) {
      ++accepted;
    }
  }
  return accepted;
}

size_t ScrcpyBridge::pendingParserBytes() const {
  return parser_ ? parser_->pendingBytes() : 0;
}

void ScrcpyBridge::setSink(FrameSink sink) {
  std::lock_guard<std::mutex> lock(sink_mutex_);
  sink_ = std::move(sink);
}

void ScrcpyBridge::recordStage(int stage, int64_t duration_ms) {
  latency_.recordStage(stage, duration_ms);
  if (stage == LatencyBudget::kTransmit || stage == LatencyBudget::kDecode ||
      stage == LatencyBudget::kAnalyze) {
    quality_.observe(duration_ms);
  }
}

AdaptiveQuality::Settings ScrcpyBridge::settings() const {
  return quality_.settings();
}

LatencyBudget::Stats ScrcpyBridge::latencyStats() const {
  return latency_.snapshot();
}

size_t ScrcpyBridge::queueDepth() const {
  return queue_ ? queue_->size() : 0;
}

uint64_t ScrcpyBridge::droppedFrames() const {
  return queue_ ? queue_->dropped() : 0;
}

std::string ScrcpyBridge::lastError() const {
  std::lock_guard<std::mutex> lock(error_mutex_);
  return last_error_;
}

void ScrcpyBridge::reconfigure(const Config& config) {
  config_ = config;
  latency_.setBudgetMs(config.latency_budget_ms);
  if (parser_) {
    parser_->reset();
  }
}

}  // namespace freehands
