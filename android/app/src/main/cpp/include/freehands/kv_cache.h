#ifndef FREEHANDS_KV_CACHE_H
#define FREEHANDS_KV_CACHE_H

#include <cstddef>
#include <cstdint>
#include <deque>
#include <vector>

namespace freehands {

// Paged key/value cache for one attention layer.
//
// Keys and values are stored in fixed-size pages rather than one contiguous
// buffer per sequence. Growing a contiguous buffer would mean reallocating and
// copying the whole cache on most tokens; with pages the growth is one page at
// a time and the pages already written never move. That is what keeps the
// per-token cost flat instead of rising with the sequence length.
//
// The cache is a ring: once it is full the oldest page is dropped to make room.
// For a phone-sized context this is preferable to failing the request, and the
// dropped-token count is reported so the caller can tell that it happened.
class KVCache {
 public:
  // Tokens per page.
  static constexpr size_t kPageSize = 8;

  KVCache() = default;
  KVCache(size_t layers, size_t max_pages_per_layer);

  size_t layers() const { return layers_.size(); }
  size_t maxPagesPerLayer() const { return max_pages_; }

  // Appends one token's key and value for [layer]. Each must hold
  // [elements_per_token] floats. Returns false when the layer index is invalid
  // or the arguments are unusable.
  bool append(size_t layer, const float* key, const float* value, size_t elements_per_token);

  // Tokens currently held for [layer].
  size_t length(size_t layer) const;

  // Copies the cached key of token [token] in [layer] into [out], which must
  // hold [out_count] floats. [token] is an index into the live window, so 0 is
  // the oldest surviving token and length(layer) - 1 the newest; the attention
  // loop walks exactly that range. Returns false when the index is outside the
  // window or the arguments are otherwise out of range.
  bool key(size_t layer, size_t token, float* out, size_t out_count) const;

  bool value(size_t layer, size_t token, float* out, size_t out_count) const;

  // Drops every token, keeping the allocated pages for reuse.
  void clear();

  // Tokens dropped because the cache was full.
  uint64_t evictions() const { return evictions_; }

  // Pages currently allocated across every layer.
  size_t allocatedPages() const;

 private:
  struct Page {
    // Keys and values for the tokens this page holds. They are kept side by
    // side so a read of either is one lookup and one copy.
    std::vector<float> keys;
    std::vector<float> values;
    size_t tokens = 0;
  };

  struct Layer {
    std::deque<Page> pages;
    size_t elements_per_token = 0;
  };

  std::vector<Layer> layers_;
  size_t max_pages_ = 1;
  uint64_t evictions_ = 0;

  // Returns the page the next token should be written to, evicting the oldest
  // page when the layer is full.
  Page* writablePage(Layer& layer);

  // Finds the page holding [token] and its in-page token offset.
  bool locate(const Layer& layer, size_t token, const Page** page, size_t* offset) const;

  // Shared read path for keys and values; they differ only in which buffer of
  // the located page is copied.
  bool read(size_t layer, size_t token, float* out, size_t out_count, bool want_keys) const;
};

}  // namespace freehands

#endif  // FREEHANDS_KV_CACHE_H
