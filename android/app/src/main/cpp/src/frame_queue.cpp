#include "freehands/frame_queue.h"

#include <chrono>

namespace freehands {

FrameQueue::FrameQueue(size_t capacity)
    : capacity_(capacity == 0 ? 1 : capacity),
      closed_(false),
      dropped_(0),
      pushed_(0) {}

size_t FrameQueue::firstDroppableIndexLocked() const {
  for (size_t i = 0; i < frames_.size(); ++i) {
    if (!frames_[i].keyframe) {
      return i;
    }
  }
  return frames_.size();
}

bool FrameQueue::push(EncodedFrame frame) {
  std::unique_lock<std::mutex> lock(mutex_);
  if (closed_) {
    return false;
  }
  if (frames_.size() >= capacity_) {
    const size_t victim = firstDroppableIndexLocked();
    if (victim == frames_.size()) {
      // Every queued frame is a keyframe; drop the oldest so the queue stays
      // bounded and the receiver still gets a decodable frame eventually.
      frames_.pop_front();
    } else {
      frames_.erase(frames_.begin() + static_cast<long>(victim));
    }
    ++dropped_;
  }
  frames_.push_back(std::move(frame));
  ++pushed_;
  lock.unlock();
  not_empty_.notify_one();
  return true;
}

bool FrameQueue::pop(EncodedFrame& out, int timeout_ms) {
  std::unique_lock<std::mutex> lock(mutex_);
  if (!not_empty_.wait_for(lock, std::chrono::milliseconds(timeout_ms),
                           [this] { return !frames_.empty() || closed_; })) {
    return false;
  }
  if (frames_.empty()) {
    return false;  // closed and drained
  }
  out = std::move(frames_.front());
  frames_.pop_front();
  lock.unlock();
  not_full_.notify_one();
  return true;
}

void FrameQueue::close() {
  std::lock_guard<std::mutex> lock(mutex_);
  closed_ = true;
  not_empty_.notify_all();
  not_full_.notify_all();
}

bool FrameQueue::closed() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return closed_;
}

size_t FrameQueue::size() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return frames_.size();
}

void FrameQueue::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  frames_.clear();
}

}  // namespace freehands
