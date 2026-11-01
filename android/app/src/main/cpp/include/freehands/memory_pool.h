#ifndef FREEHANDS_MEMORY_POOL_H
#define FREEHANDS_MEMORY_POOL_H

#include <cstddef>
#include <cstdint>
#include <memory>

namespace freehands {

// Bump allocator for activations and scratch buffers.
//
// Every allocation is taken from one block reserved up front. Reserving the
// block once means a generation step performs no allocator calls at all: on
// Android a fresh allocation can trigger a stop-the-world GC while the feed is
// streaming, which would show up as a dropped frame. The pool trades a fixed
// memory ceiling for a steady frame time, and the ceiling is reported through
// highWaterMark() so a too-small pool is visible instead of fatal.
//
// reset() reclaims everything at once, which is what the engine does between
// generation steps.
class MemoryPool {
 public:
  // Alignment that keeps float and NEON/SIMD loads aligned. The pool pads its
  // backing block so the first block sits on this boundary; requests for a
  // larger alignment are honoured only up to this value.
  static constexpr size_t kDefaultAlignment = 64;

  explicit MemoryPool(size_t capacity_bytes);
  ~MemoryPool();

  MemoryPool(const MemoryPool&) = delete;
  MemoryPool& operator=(const MemoryPool&) = delete;

  // Returns a zeroed block, or nullptr when the pool cannot serve it. The
  // block stays valid until reset() or destruction.
  void* allocate(size_t bytes, size_t alignment = kDefaultAlignment);

  // Reclaims every block. Existing pointers become invalid.
  void reset();

  size_t capacity() const { return capacity_; }
  size_t used() const { return used_; }

  // Largest amount ever live at once, the figure to size the pool from.
  size_t highWaterMark() const { return high_water_; }

  // Allocations served, for tests and diagnostics.
  uint64_t allocations() const { return allocations_; }

 private:
  // Owns the raw block. buffer_ points inside it, padded up so the first
  // allocation lands on kDefaultAlignment: aligning only the offset would
  // leave the address misaligned whenever the raw block is.
  std::unique_ptr<uint8_t[]> storage_;
  uint8_t* buffer_ = nullptr;
  size_t capacity_ = 0;
  size_t used_ = 0;
  size_t high_water_ = 0;
  uint64_t allocations_ = 0;
};

}  // namespace freehands

#endif  // FREEHANDS_MEMORY_POOL_H
