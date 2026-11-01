#include "freehands/memory_pool.h"

#include <cstring>

namespace freehands {

MemoryPool::MemoryPool(size_t capacity_bytes) {
  if (capacity_bytes == 0) {
    return;
  }
  // One extra alignment of slack so the base can be rounded up.
  storage_ = std::unique_ptr<uint8_t[]>(new uint8_t[capacity_bytes + kDefaultAlignment]);
  const auto raw_address = reinterpret_cast<uintptr_t>(storage_.get());
  const size_t misalignment = raw_address % kDefaultAlignment;
  const size_t padding = misalignment == 0 ? 0 : kDefaultAlignment - misalignment;
  buffer_ = storage_.get() + padding;
  capacity_ = capacity_bytes;
}

MemoryPool::~MemoryPool() = default;

void* MemoryPool::allocate(size_t bytes, size_t alignment) {
  if (bytes == 0 || buffer_ == nullptr) {
    return nullptr;
  }
  const size_t align = alignment == 0 ? kDefaultAlignment : alignment;
  // Round the current offset up to the requested alignment.
  const size_t aligned = (used_ + align - 1) / align * align;
  if (aligned > capacity_ || bytes > capacity_ - aligned) {
    return nullptr;
  }
  void* block = buffer_ + aligned;
  std::memset(block, 0, bytes);
  used_ = aligned + bytes;
  if (used_ > high_water_) {
    high_water_ = used_;
  }
  ++allocations_;
  return block;
}

void MemoryPool::reset() {
  used_ = 0;
  allocations_ = 0;
}

}  // namespace freehands
