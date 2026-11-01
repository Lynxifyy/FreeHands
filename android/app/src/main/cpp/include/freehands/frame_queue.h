#ifndef FREEHANDS_FRAME_QUEUE_H
#define FREEHANDS_FRAME_QUEUE_H

#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <mutex>
#include <vector>

namespace freehands {

// One encoded access unit ready to be handed to the transport layer.
struct EncodedFrame {
  std::vector<uint8_t> data;
  uint64_t sequence = 0;
  int64_t capture_ts_us = 0;
  bool keyframe = false;
  int width = 0;
  int height = 0;
  int bitrate_kbps = 0;
};

// Bounded FIFO between the capture thread and the transport thread.
//
// Bounded so a slow socket cannot grow memory without limit. When full, the
// queue drops the oldest *non-keyframe* frame: dropping a keyframe would make
// the receiver undecodable until the next IDR, while dropping a P-frame only
// costs a moment of motion.
class FrameQueue {
 public:
  explicit FrameQueue(size_t capacity);

  // Non-blocking push. Returns false when the queue is closed.
  // When full, evicts the oldest droppable frame and counts a drop.
  bool push(EncodedFrame frame);

  // Waits up to |timeout_ms| for a frame. Returns false on timeout/close.
  bool pop(EncodedFrame& out, int timeout_ms);

  void close();

  bool closed() const;

  size_t size() const;

  size_t capacity() const { return capacity_; }

  uint64_t dropped() const { return dropped_; }

  uint64_t pushed() const { return pushed_; }

  void clear();

 private:
  size_t firstDroppableIndexLocked() const;

  mutable std::mutex mutex_;
  std::condition_variable not_empty_;
  std::condition_variable not_full_;
  std::deque<EncodedFrame> frames_;
  size_t capacity_;
  bool closed_;
  uint64_t dropped_;
  uint64_t pushed_;
};

}  // namespace freehands

#endif  // FREEHANDS_FRAME_QUEUE_H
