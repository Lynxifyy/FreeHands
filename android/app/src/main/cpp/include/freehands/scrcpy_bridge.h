#ifndef FREEHANDS_SCRCPY_BRIDGE_H
#define FREEHANDS_SCRCPY_BRIDGE_H

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "freehands/adaptive_quality.h"
#include "freehands/frame_queue.h"
#include "freehands/h264_parser.h"
#include "freehands/latency_budget.h"

namespace freehands {

// A single captured frame as produced by an encoder.
struct RawFrame {
  // Pointer to the encoder output; must stay valid for the duration of push().
  const uint8_t* data = nullptr;
  size_t length = 0;
  int64_t capture_ts_us = 0;
  bool keyframe = false;
  int width = 0;
  int height = 0;
};

// Callback invoked on the capture thread for every queued frame. Returning
// false drops the frame. Set via setSink().
using FrameSink = std::function<bool(const EncodedFrame&)>;

// Core of the Scrcpy-based screen-capture pipeline.
//
// ScrcpyBridge owns the capture thread and the encoded-frame queue. It is a
// plain C++ class with no Android dependencies so it can be unit tested on the
// host; the JNI layer (scrcpy_bridge_jni.cpp) and the Kotlin LiveFeedServer
// wrap it. The Android side supplies frames either from MediaCodec (the normal
// path) or from the scrcpy server socket; both call pushFrame().
class ScrcpyBridge {
 public:
  struct Config {
    int width = 1080;
    int height = 1920;
    int fps = 12;
    int bitrate_kbps = 4000;
    int64_t latency_budget_ms = LatencyBudget::kDefaultBudgetMs;
    size_t queue_capacity = 8;
  };

  ScrcpyBridge();
  explicit ScrcpyBridge(Config config);
  ~ScrcpyBridge();

  ScrcpyBridge(const ScrcpyBridge&) = delete;
  ScrcpyBridge& operator=(const ScrcpyBridge&) = delete;

  // Starts the capture/drain thread. Idempotent.
  bool start();

  // Stops the thread and closes the queue. Idempotent. Safe to call twice.
  void stop();

  bool running() const { return running_.load(); }

  // Feeds one encoded frame from the Android side. Returns false when the
  // bridge is not running, the frame is malformed, or the queue is closed.
  bool pushFrame(const RawFrame& frame);

  // Feeds a chunk of the raw H.264 byte stream; the bridge parses Annex-B NAL
  // units and enqueues each complete access unit. Used by the scrcpy socket
  // path, which delivers a byte stream rather than discrete frames.
  size_t pushEncodedChunk(const uint8_t* data, size_t length,
                          int64_t capture_ts_us);

  // Emits the trailing NAL held back because no following start code arrived
  // yet. A NAL is only known to be complete once the next start code is seen,
  // so this is what releases the last unit of a stream. Returns the number of
  // frames queued.
  size_t flushParser(int64_t capture_ts_us);

  // Bytes buffered by the Annex-B parser but not yet emitted as frames.
  size_t pendingParserBytes() const;

  // Registers the consumer that forwards frames over the transport. Passing an
  // empty function clears it.
  void setSink(FrameSink sink);

  // Records a completed stage duration so the adaptive controller can react.
  void recordStage(int stage, int64_t duration_ms);

  // Current quality settings after adaptation.
  AdaptiveQuality::Settings settings() const;

  LatencyBudget::Stats latencyStats() const;

  size_t queueDepth() const;

  uint64_t droppedFrames() const;

  uint64_t framesCaptured() const { return frames_captured_.load(); }

  // Snapshot of the last error, empty when none.
  std::string lastError() const;

  // Rebuilds the pipeline for a new capture size (device rotation). Frames
  // already queued are drained; a fresh IDR is requested from the encoder by
  // the caller.
  void reconfigure(const Config& config);

  const Config& config() const { return config_; }

 private:
  void runLoop();

  Config config_;
  AdaptiveQuality quality_;
  LatencyBudget latency_;
  std::unique_ptr<FrameQueue> queue_;
  std::unique_ptr<H264Parser> parser_;

  mutable std::mutex sink_mutex_;
  FrameSink sink_;

  mutable std::mutex error_mutex_;
  std::string last_error_;

  std::atomic<bool> running_;
  std::atomic<bool> stop_requested_;
  std::atomic<uint64_t> frames_captured_;
  std::atomic<uint64_t> sequence_;
  std::thread thread_;
};

}  // namespace freehands

#endif  // FREEHANDS_SCRCPY_BRIDGE_H
