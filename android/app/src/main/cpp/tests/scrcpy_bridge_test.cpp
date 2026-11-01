#include <gtest/gtest.h>

#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

#include "freehands/scrcpy_bridge.h"

namespace freehands {
namespace {

// Builds an Annex-B access unit: SPS (7) + IDR slice (5) when keyframe, or a
// single non-IDR slice (1) otherwise.
std::vector<uint8_t> accessUnit(bool keyframe, size_t payload = 8) {
  std::vector<uint8_t> out;
  if (keyframe) {
    out.insert(out.end(), {0x00, 0x00, 0x00, 0x01, 0x67});
    out.insert(out.end(), payload, 0xAA);
  }
  out.insert(out.end(), {0x00, 0x00, 0x00, 0x01,
                         static_cast<uint8_t>(keyframe ? 0x65 : 0x41)});
  out.insert(out.end(), payload, 0xBB);
  return out;
}

RawFrame rawFrom(const std::vector<uint8_t>& bytes, bool keyframe) {
  RawFrame frame;
  frame.data = bytes.data();
  frame.length = bytes.size();
  frame.keyframe = keyframe;
  frame.width = 1080;
  frame.height = 1920;
  frame.capture_ts_us = 1000;
  return frame;
}

class SinkCollector {
 public:
  bool onFrame(const EncodedFrame& frame) {
    std::lock_guard<std::mutex> lock(mutex_);
    frames_.push_back(frame);
    cv_.notify_all();
    return true;
  }

  bool waitFor(size_t count, int timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    return cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms),
                        [&] { return frames_.size() >= count; });
  }

  size_t size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return frames_.size();
  }

  EncodedFrame at(size_t i) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return frames_[i];
  }

 private:
  mutable std::mutex mutex_;
  std::condition_variable cv_;
  std::vector<EncodedFrame> frames_;
};

TEST(ScrcpyBridgeTest, StartsAndStopsIdempotently) {
  ScrcpyBridge bridge;
  EXPECT_TRUE(bridge.start());
  EXPECT_TRUE(bridge.start());
  EXPECT_TRUE(bridge.running());
  bridge.stop();
  bridge.stop();
  EXPECT_FALSE(bridge.running());
}

TEST(ScrcpyBridgeTest, RejectsPushWhenNotRunning) {
  ScrcpyBridge bridge;
  const std::vector<uint8_t> bytes = accessUnit(true);
  EXPECT_FALSE(bridge.pushFrame(rawFrom(bytes, true)));
  EXPECT_EQ(bridge.lastError(), "bridge not running");
}

TEST(ScrcpyBridgeTest, RejectsEmptyFrame) {
  ScrcpyBridge bridge;
  bridge.start();
  RawFrame frame;
  EXPECT_FALSE(bridge.pushFrame(frame));
  EXPECT_EQ(bridge.lastError(), "empty frame");
  bridge.stop();
}

TEST(ScrcpyBridgeTest, DeliversPushedFramesToTheSink) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();

  const std::vector<uint8_t> bytes = accessUnit(true);
  ASSERT_TRUE(bridge.pushFrame(rawFrom(bytes, true)));
  ASSERT_TRUE(sink.waitFor(1, 1000));

  EXPECT_TRUE(sink.at(0).keyframe);
  EXPECT_EQ(sink.at(0).data.size(), bytes.size());
  EXPECT_EQ(bridge.framesCaptured(), 1u);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, ParsesAnnexBChunkIntoNalUnits) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();

  // SPS + IDR: the IDR's start code terminates the SPS, so exactly one unit is
  // complete after the append and the IDR stays buffered until flushParser().
  const std::vector<uint8_t> au = accessUnit(true);
  const size_t emitted = bridge.pushEncodedChunk(au.data(), au.size(), 5000);

  EXPECT_EQ(emitted, 1u);
  EXPECT_GT(bridge.pendingParserBytes(), 0u);
  EXPECT_EQ(bridge.flushParser(5000), 1u);

  ASSERT_TRUE(sink.waitFor(2, 1000));
  EXPECT_FALSE(sink.at(0).keyframe);  // SPS
  EXPECT_TRUE(sink.at(1).keyframe);   // IDR
  bridge.stop();
}

TEST(ScrcpyBridgeTest, FlushParserEmitsTheTrailingNal) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();

  const std::vector<uint8_t> au = accessUnit(false);  // single P slice
  ASSERT_EQ(bridge.pushEncodedChunk(au.data(), au.size(), 7000), 0u);
  EXPECT_EQ(bridge.flushParser(7000), 1u);
  ASSERT_TRUE(sink.waitFor(1, 1000));
  EXPECT_FALSE(sink.at(0).keyframe);
  EXPECT_EQ(bridge.pendingParserBytes(), 0u);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, AssignsMonotonicSequenceNumbers) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();

  const std::vector<uint8_t> bytes = accessUnit(false);
  for (int i = 0; i < 3; ++i) {
    ASSERT_TRUE(bridge.pushFrame(rawFrom(bytes, false)));
  }
  ASSERT_TRUE(sink.waitFor(3, 1000));
  EXPECT_LT(sink.at(0).sequence, sink.at(1).sequence);
  EXPECT_LT(sink.at(1).sequence, sink.at(2).sequence);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, AppliesAdaptiveQualityBitrateToFrames) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();

  const std::vector<uint8_t> bytes = accessUnit(true);
  ASSERT_TRUE(bridge.pushFrame(rawFrom(bytes, true)));
  ASSERT_TRUE(sink.waitFor(1, 1000));
  EXPECT_EQ(sink.at(0).bitrate_kbps, bridge.settings().bitrate_kbps);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, StepsQualityDownUnderSustainedLatency) {
  ScrcpyBridge bridge;
  bridge.start();
  const AdaptiveQuality::Settings before = bridge.settings();
  for (int i = 0; i < 10; ++i) {
    bridge.recordStage(LatencyBudget::kTransmit, 900);
  }
  const AdaptiveQuality::Settings after = bridge.settings();
  EXPECT_LT(after.bitrate_kbps, before.bitrate_kbps);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, ExposesLatencyStats) {
  ScrcpyBridge bridge;
  bridge.start();
  bridge.recordStage(LatencyBudget::kCapture, 30);
  const LatencyBudget::Stats stats = bridge.latencyStats();
  EXPECT_EQ(stats.stage_ms[LatencyBudget::kCapture], 30);
  EXPECT_EQ(stats.budget_ms, 150);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, BoundsTheQueueAndCountsDrops) {
  ScrcpyBridge::Config config;
  config.queue_capacity = 2;
  ScrcpyBridge bridge(config);
  // No sink: frames fill the bounded queue and are dropped past capacity.
  bridge.start();

  const std::vector<uint8_t> bytes = accessUnit(false);
  for (int i = 0; i < 10; ++i) {
    ASSERT_TRUE(bridge.pushFrame(rawFrom(bytes, false)));
  }
  EXPECT_LE(bridge.queueDepth(), 2u);
  EXPECT_GT(bridge.droppedFrames(), 0u);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, ClearSinkStopsDelivery) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();
  bridge.setSink(nullptr);

  const std::vector<uint8_t> bytes = accessUnit(true);
  ASSERT_TRUE(bridge.pushFrame(rawFrom(bytes, true)));
  std::this_thread::sleep_for(std::chrono::milliseconds(60));
  EXPECT_EQ(sink.size(), 0u);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, StopIsSafeWhileFramesAreInFlight) {
  ScrcpyBridge bridge;
  SinkCollector sink;
  bridge.setSink([&](const EncodedFrame& f) { return sink.onFrame(f); });
  bridge.start();

  const std::vector<uint8_t> bytes = accessUnit(true);
  for (int i = 0; i < 20; ++i) {
    bridge.pushFrame(rawFrom(bytes, true));
  }
  bridge.stop();
  EXPECT_FALSE(bridge.running());
}

TEST(ScrcpyBridgeTest, ReconfigureUpdatesBudgetAndClearsParser) {
  ScrcpyBridge bridge;
  bridge.start();
  ScrcpyBridge::Config config;
  config.latency_budget_ms = 90;
  config.queue_capacity = 4;
  bridge.reconfigure(config);

  EXPECT_EQ(bridge.config().latency_budget_ms, 90);
  EXPECT_EQ(bridge.latencyStats().budget_ms, 90);
  bridge.stop();
}

TEST(ScrcpyBridgeTest, ReportsSinkRejectionInLastError) {
  ScrcpyBridge bridge;
  bridge.setSink([](const EncodedFrame&) { return false; });
  bridge.start();

  const std::vector<uint8_t> bytes = accessUnit(true);
  ASSERT_TRUE(bridge.pushFrame(rawFrom(bytes, true)));

  for (int i = 0; i < 100 && bridge.lastError().empty(); ++i) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  EXPECT_EQ(bridge.lastError(), "sink rejected frame");
  bridge.stop();
}

}  // namespace
}  // namespace freehands
