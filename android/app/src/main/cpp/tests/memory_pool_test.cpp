#include "freehands/memory_pool.h"

#include <cstdint>
#include <thread>
#include <vector>

#include <gtest/gtest.h>

namespace freehands {
namespace {

TEST(MemoryPoolTest, ServesBlocksInsideTheCapacity) {
  MemoryPool pool(1024);

  void* first = pool.allocate(100);
  void* second = pool.allocate(100);

  EXPECT_NE(nullptr, first);
  EXPECT_NE(nullptr, second);
  EXPECT_NE(first, second);
  EXPECT_LE(pool.used(), pool.capacity());
}

TEST(MemoryPoolTest, ReturnsZeroedMemory) {
  MemoryPool pool(256);

  auto* block = static_cast<uint8_t*>(pool.allocate(64));

  ASSERT_NE(nullptr, block);
  for (size_t i = 0; i < 64; ++i) {
    EXPECT_EQ(0, block[i]);
  }
}

TEST(MemoryPoolTest, AlignsBlocksToTheRequestedBoundary) {
  MemoryPool pool(4096);

  auto* first = static_cast<uint8_t*>(pool.allocate(3));
  auto* second = static_cast<uint8_t*>(pool.allocate(3, 64));

  ASSERT_NE(nullptr, first);
  ASSERT_NE(nullptr, second);
  EXPECT_EQ(0u, reinterpret_cast<uintptr_t>(second) % 64u);
}

TEST(MemoryPoolTest, RefusesBlocksBeyondTheCapacity) {
  MemoryPool pool(128);

  EXPECT_NE(nullptr, pool.allocate(128));
  EXPECT_EQ(nullptr, pool.allocate(1));
}

TEST(MemoryPoolTest, TracksTheHighWaterMark) {
  MemoryPool pool(4096);

  pool.allocate(512);
  pool.allocate(256);
  const size_t peak = pool.highWaterMark();
  pool.reset();
  pool.allocate(64);

  EXPECT_GE(peak, 768u);
  EXPECT_LT(pool.used(), peak);
}

TEST(MemoryPoolTest, ResetReclaimsEverything) {
  MemoryPool pool(1024);
  pool.allocate(512);
  pool.allocate(256);

  pool.reset();

  EXPECT_EQ(0u, pool.used());
  EXPECT_NE(nullptr, pool.allocate(1024));
}

TEST(MemoryPoolTest, AZeroSizedPoolRefusesEverything) {
  MemoryPool pool(0);

  EXPECT_EQ(nullptr, pool.allocate(1));
}

TEST(MemoryPoolTest, ConcurrentAllocationsStayInsideTheCapacity) {
  MemoryPool pool(64 * 1024);
  std::vector<std::thread> workers;
  std::atomic<int> successes{0};
  for (int worker = 0; worker < 8; ++worker) {
    workers.emplace_back([&pool, &successes]() {
      for (int i = 0; i < 100; ++i) {
        if (pool.allocate(64) != nullptr) {
          successes.fetch_add(1);
        }
      }
    });
  }
  for (std::thread& worker : workers) {
    worker.join();
  }

  EXPECT_LE(pool.used(), pool.capacity());
  EXPECT_GT(successes.load(), 0);
}

}  // namespace
}  // namespace freehands
