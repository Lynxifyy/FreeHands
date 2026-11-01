#include <gtest/gtest.h>

#include <atomic>
#include <chrono>
#include <thread>

#include "freehands/frame_queue.h"

namespace freehands {
namespace {

EncodedFrame frame(uint64_t seq, bool keyframe, size_t bytes = 4) {
  EncodedFrame f;
  f.data.assign(bytes, static_cast<uint8_t>(seq & 0xff));
  f.sequence = seq;
  f.keyframe = keyframe;
  f.capture_ts_us = static_cast<int64_t>(seq) * 1000;
  return f;
}

TEST(FrameQueueTest, PushThenPopPreservesOrder) {
  FrameQueue queue(4);
  ASSERT_TRUE(queue.push(frame(1, false)));
  ASSERT_TRUE(queue.push(frame(2, false)));

  EncodedFrame out;
  ASSERT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 1u);
  ASSERT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 2u);
  EXPECT_EQ(queue.size(), 0u);
}

TEST(FrameQueueTest, ZeroCapacityIsClampedToOne) {
  FrameQueue queue(0);
  EXPECT_EQ(queue.capacity(), 1u);
  ASSERT_TRUE(queue.push(frame(1, true)));
  EXPECT_EQ(queue.size(), 1u);
}

TEST(FrameQueueTest, DropsOldestNonKeyframeWhenFull) {
  FrameQueue queue(3);
  ASSERT_TRUE(queue.push(frame(1, true)));   // keyframe: never dropped first
  ASSERT_TRUE(queue.push(frame(2, false)));
  ASSERT_TRUE(queue.push(frame(3, false)));
  ASSERT_TRUE(queue.push(frame(4, false)));  // evicts frame 2

  EXPECT_EQ(queue.size(), 3u);
  EXPECT_EQ(queue.dropped(), 1u);

  EncodedFrame out;
  ASSERT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 1u);  // keyframe retained
  ASSERT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 3u);
  ASSERT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 4u);
}

TEST(FrameQueueTest, EvictsOldestKeyframeWhenAllAreKeyframes) {
  FrameQueue queue(2);
  ASSERT_TRUE(queue.push(frame(1, true)));
  ASSERT_TRUE(queue.push(frame(2, true)));
  ASSERT_TRUE(queue.push(frame(3, true)));

  EXPECT_EQ(queue.size(), 2u);
  EXPECT_EQ(queue.dropped(), 1u);
  EncodedFrame out;
  ASSERT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 2u);
}

TEST(FrameQueueTest, RejectsPushAfterClose) {
  FrameQueue queue(2);
  queue.close();
  EXPECT_FALSE(queue.push(frame(1, false)));
  EXPECT_TRUE(queue.closed());
}

TEST(FrameQueueTest, PopReturnsFalseOnTimeout) {
  FrameQueue queue(2);
  EncodedFrame out;
  EXPECT_FALSE(queue.pop(out, 5));
}

TEST(FrameQueueTest, PopDrainsRemainingFramesAfterClose) {
  FrameQueue queue(2);
  ASSERT_TRUE(queue.push(frame(1, true)));
  queue.close();

  EncodedFrame out;
  EXPECT_TRUE(queue.pop(out, 0));
  EXPECT_EQ(out.sequence, 1u);
  EXPECT_FALSE(queue.pop(out, 0));
}

TEST(FrameQueueTest, CountsPushesAndDrops) {
  FrameQueue queue(2);
  for (uint64_t i = 0; i < 5; ++i) {
    ASSERT_TRUE(queue.push(frame(i, false)));
  }
  EXPECT_EQ(queue.pushed(), 5u);
  EXPECT_EQ(queue.dropped(), 3u);
  EXPECT_EQ(queue.size(), 2u);
}

TEST(FrameQueueTest, ClearEmptiesWithoutClosing) {
  FrameQueue queue(4);
  ASSERT_TRUE(queue.push(frame(1, false)));
  queue.clear();
  EXPECT_EQ(queue.size(), 0u);
  EXPECT_FALSE(queue.closed());
}

TEST(FrameQueueTest, BlocksUntilProducerPushes) {
  FrameQueue queue(4);
  std::atomic<bool> got{false};
  std::thread consumer([&] {
    EncodedFrame out;
    if (queue.pop(out, 500)) {
      got.store(out.sequence == 42u);
    }
  });
  std::this_thread::sleep_for(std::chrono::milliseconds(20));
  ASSERT_TRUE(queue.push(frame(42, true)));
  consumer.join();
  EXPECT_TRUE(got.load());
}

}  // namespace
}  // namespace freehands
