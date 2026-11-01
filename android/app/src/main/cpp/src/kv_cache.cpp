#include "freehands/kv_cache.h"

#include <algorithm>
#include <cstring>

namespace freehands {

KVCache::KVCache(size_t layers, size_t max_pages_per_layer)
    : layers_(layers), max_pages_(std::max<size_t>(1, max_pages_per_layer)) {}

KVCache::Page* KVCache::writablePage(Layer& layer) {
  // Start a fresh page unless the newest one still has room.
  if (layer.pages.empty() || layer.pages.back().tokens >= kPageSize) {
    if (layer.pages.size() >= max_pages_) {
      // Full: move the oldest page to the back and reuse its buffer, so a
      // steady-state sequence allocates at most max_pages_ pages in total.
      Page recycled = std::move(layer.pages.front());
      evictions_ += recycled.tokens;
      layer.pages.pop_front();
      // The recycled page is appended empty, so the tokens it held leave the
      // live range and a read of an evicted index fails.
      recycled.tokens = 0;
      layer.pages.push_back(std::move(recycled));
    } else {
      layer.pages.emplace_back();
    }
  }
  return &layer.pages.back();
}

bool KVCache::append(size_t layer, const float* key, const float* value,
                     size_t elements_per_token) {
  if (layer >= layers_.size() || key == nullptr || value == nullptr ||
      elements_per_token == 0) {
    return false;
  }
  Layer& target = layers_[layer];
  target.elements_per_token = elements_per_token;

  Page* page = writablePage(target);
  if (page == nullptr) {
    return false;
  }
  const size_t offset = page->tokens * elements_per_token;
  if (page->keys.size() < offset + elements_per_token) {
    page->keys.resize(offset + elements_per_token);
    page->values.resize(offset + elements_per_token);
  }
  std::memcpy(page->keys.data() + offset, key, elements_per_token * sizeof(float));
  std::memcpy(page->values.data() + offset, value, elements_per_token * sizeof(float));
  ++page->tokens;
  return true;
}

size_t KVCache::length(size_t layer) const {
  if (layer >= layers_.size()) {
    return 0;
  }
  size_t total = 0;
  for (const Page& page : layers_[layer].pages) {
    total += page.tokens;
  }
  return total;
}

bool KVCache::locate(const Layer& layer, size_t token, const Page** page,
                     size_t* offset) const {
  size_t seen = 0;
  for (const Page& candidate : layer.pages) {
    if (token < seen + candidate.tokens) {
      *page = &candidate;
      *offset = token - seen;
      return true;
    }
    seen += candidate.tokens;
  }
  return false;
}

bool KVCache::read(size_t layer, size_t token, float* out, size_t out_count,
                   bool want_keys) const {
  if (layer >= layers_.size() || out == nullptr) {
    return false;
  }
  const Layer& target = layers_[layer];
  if (target.elements_per_token == 0 || out_count < target.elements_per_token) {
    return false;
  }
  const Page* page = nullptr;
  size_t offset = 0;
  if (!locate(target, token, &page, &offset)) {
    return false;
  }
  const std::vector<float>& source = want_keys ? page->keys : page->values;
  const size_t element_offset = offset * target.elements_per_token;
  if (source.size() < element_offset + target.elements_per_token) {
    return false;
  }
  std::memcpy(out, source.data() + element_offset,
              target.elements_per_token * sizeof(float));
  return true;
}

bool KVCache::key(size_t layer, size_t token, float* out, size_t out_count) const {
  return read(layer, token, out, out_count, /*want_keys=*/true);
}

bool KVCache::value(size_t layer, size_t token, float* out, size_t out_count) const {
  return read(layer, token, out, out_count, /*want_keys=*/false);
}

void KVCache::clear() {
  for (Layer& layer : layers_) {
    for (Page& page : layer.pages) {
      page.tokens = 0;
    }
    layer.pages.clear();
  }
}

size_t KVCache::allocatedPages() const {
  size_t total = 0;
  for (const Layer& layer : layers_) {
    total += layer.pages.size();
  }
  return total;
}

}  // namespace freehands
