#include "freehands/kv_cache.h"

#include <numeric>
#include <vector>

#include <gtest/gtest.h>

namespace freehands {
namespace {

std::vector<float> ramp(size_t count, float base) {
  std::vector<float> values(count);
  for (size_t i = 0; i < count; ++i) {
    values[i] = base + static_cast<float>(i);
  }
  return values;
}

TEST(KVCacheTest, AppendsAndReadsBackAToken) {
  KVCache cache(1, 4);
  const std::vector<float> key = ramp(4, 1.0f);
  const std::vector<float> value = ramp(4, 100.0f);

  ASSERT_TRUE(cache.append(0, key.data(), value.data(), 4));
  ASSERT_EQ(1u, cache.length(0));

  std::vector<float> read(4, 0.0f);
  ASSERT_TRUE(cache.key(0, 0, read.data(), read.size()));
  EXPECT_FLOAT_EQ(1.0f, read[0]);
  EXPECT_FLOAT_EQ(4.0f, read[3]);

  ASSERT_TRUE(cache.value(0, 0, read.data(), read.size()));
  EXPECT_FLOAT_EQ(100.0f, read[0]);
}

TEST(KVCacheTest, KeepsTokensInOrderAcrossPages) {
  KVCache cache(1, 8);
  const size_t per_token = 2;

  for (int token = 0; token < 20; ++token) {
    const std::vector<float> key{static_cast<float>(token), 0.0f};
    ASSERT_TRUE(cache.append(0, key.data(), key.data(), per_token));
  }

  EXPECT_EQ(20u, cache.length(0));
  std::vector<float> read(per_token, 0.0f);
  for (int token = 0; token < 20; ++token) {
    ASSERT_TRUE(cache.key(0, static_cast<size_t>(token), read.data(), read.size()));
    EXPECT_FLOAT_EQ(static_cast<float>(token), read[0]) << "token " << token;
  }
}

TEST(KVCacheTest, EvictsTheOldestTokensWhenFull) {
  // Two pages of eight tokens: capacity is sixteen, so the seventeenth token
  // drops the first page and its eight tokens.
  KVCache cache(1, 2);
  for (int token = 0; token < 24; ++token) {
    const std::vector<float> key{static_cast<float>(token)};
    ASSERT_TRUE(cache.append(0, key.data(), key.data(), 1));
  }

  EXPECT_EQ(2 * KVCache::kPageSize, cache.length(0));
  EXPECT_EQ(8u, cache.evictions());

  // Reads are indexed from the start of the live window, so index 0 is the
  // oldest surviving token (absolute 8) and the last index is the newest.
  std::vector<float> read(1, 0.0f);
  ASSERT_TRUE(cache.key(0, 0, read.data(), read.size()));
  EXPECT_FLOAT_EQ(8.0f, read[0]);
  ASSERT_TRUE(cache.key(0, cache.length(0) - 1, read.data(), read.size()));
  EXPECT_FLOAT_EQ(23.0f, read[0]);
  EXPECT_FALSE(cache.key(0, cache.length(0), read.data(), read.size()));
}

TEST(KVCacheTest, ReusesPagesInsteadOfAllocatingForever) {
  KVCache cache(1, 2);
  for (int token = 0; token < 100; ++token) {
    const std::vector<float> key{static_cast<float>(token)};
    cache.append(0, key.data(), key.data(), 1);
  }

  EXPECT_LE(cache.allocatedPages(), 2u);
}

TEST(KVCacheTest, LayersAreIndependent) {
  KVCache cache(2, 4);
  const std::vector<float> key{5.0f};

  ASSERT_TRUE(cache.append(1, key.data(), key.data(), 1));

  EXPECT_EQ(0u, cache.length(0));
  EXPECT_EQ(1u, cache.length(1));
}

TEST(KVCacheTest, RejectsAnInvalidLayer) {
  KVCache cache(1, 4);
  const std::vector<float> key{1.0f};

  EXPECT_FALSE(cache.append(3, key.data(), key.data(), 1));
}

TEST(KVCacheTest, RejectsNullBuffersAndZeroWidth) {
  KVCache cache(1, 4);
  const std::vector<float> key{1.0f};

  EXPECT_FALSE(cache.append(0, nullptr, key.data(), 1));
  EXPECT_FALSE(cache.append(0, key.data(), nullptr, 1));
  EXPECT_FALSE(cache.append(0, key.data(), key.data(), 0));
}

TEST(KVCacheTest, RejectsAnUndersizedReadBuffer) {
  KVCache cache(1, 4);
  const std::vector<float> key = ramp(4, 1.0f);
  cache.append(0, key.data(), key.data(), 4);
  std::vector<float> small(2, 0.0f);

  EXPECT_FALSE(cache.key(0, 0, small.data(), small.size()));
}

TEST(KVCacheTest, ClearDropsEveryToken) {
  KVCache cache(1, 4);
  const std::vector<float> key{1.0f};
  cache.append(0, key.data(), key.data(), 1);

  cache.clear();

  EXPECT_EQ(0u, cache.length(0));
  EXPECT_TRUE(cache.append(0, key.data(), key.data(), 1));
}

TEST(KVCacheTest, DefaultConstructedCacheHoldsNothing) {
  KVCache cache;

  EXPECT_EQ(0u, cache.layers());
  EXPECT_EQ(0u, cache.length(0));
}

}  // namespace
}  // namespace freehands
