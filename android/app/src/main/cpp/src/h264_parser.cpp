#include "freehands/h264_parser.h"

namespace freehands {

int H264Parser::findStartCode(const uint8_t* data, size_t len, size_t from) {
  if (data == nullptr || len < 3) {
    return kNoStartCode;
  }
  for (size_t i = from; i + 2 < len; ++i) {
    if (data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1) {
      return static_cast<int>(i);
    }
  }
  return kNoStartCode;
}

void H264Parser::compactLocked() {
  if (consumed_ == 0) {
    return;
  }
  buffer_.erase(buffer_.begin(), buffer_.begin() + static_cast<long>(consumed_));
  consumed_ = 0;
}

void H264Parser::scanLocked(std::vector<NalUnit>& out) {
  size_t cursor = consumed_;
  while (true) {
    const int triple = findStartCode(buffer_.data(), buffer_.size(), cursor);
    if (triple == kNoStartCode) {
      break;
    }
    // findStartCode locates the 00 00 01 triple; for a 4-byte code the triple
    // is the last three bytes, so the payload always starts at triple + 3.
    const size_t payload = static_cast<size_t>(triple) + 3;
    const int next = findStartCode(buffer_.data(), buffer_.size(), payload);
    if (next == kNoStartCode) {
      break;  // unit still incomplete; keep it buffered for the next append
    }
    // Trailing zero bytes belong to the following start code, not the payload.
    size_t end = static_cast<size_t>(next);
    while (end > payload && buffer_[end - 1] == 0) {
      --end;
    }
    cursor = static_cast<size_t>(next);
    const size_t unit_len = end - payload;
    if (unit_len == 0 || unit_len > kMaxNalSize) {
      continue;  // empty or oversized unit: skip it
    }
    NalUnit unit;
    unit.offset = payload;
    unit.length = unit_len;
    unit.type = nalType(buffer_[payload]);
    unit.nal_ref_idc = (buffer_[payload] >> 5) & 0x3;
    unit.keyframe = unit.type == 5;
    out.push_back(unit);
  }
  consumed_ = cursor;
}

size_t H264Parser::append(const uint8_t* data, size_t len,
                          std::vector<NalUnit>& out) {
  const size_t produced = out.size();
  if (data == nullptr || len == 0) {
    return 0;
  }

  // Offsets from the previous call expire here, so it is safe to compact.
  compactLocked();
  buffer_.insert(buffer_.end(), data, data + len);

  if (buffer_.size() > kMaxNalSize) {
    buffer_.clear();  // runaway unit with no terminator: treat as corruption
    consumed_ = 0;
    out.resize(produced);
    return 0;
  }

  scanLocked(out);
  return out.size() - produced;
}

bool H264Parser::flush(std::vector<NalUnit>& out) {
  if (buffer_.size() <= consumed_) {
    reset();
    return false;
  }
  const int triple = findStartCode(buffer_.data(), buffer_.size(), consumed_);
  if (triple == kNoStartCode) {
    reset();
    return false;
  }
  const size_t payload = static_cast<size_t>(triple) + 3;
  if (payload >= buffer_.size()) {
    reset();
    return false;
  }
  size_t end = buffer_.size();
  while (end > payload && buffer_[end - 1] == 0) {
    --end;
  }
  const size_t unit_len = end - payload;
  if (unit_len == 0 || unit_len > kMaxNalSize) {
    reset();
    return false;
  }
  NalUnit unit;
  unit.offset = payload;
  unit.length = unit_len;
  unit.type = nalType(buffer_[payload]);
  unit.nal_ref_idc = (buffer_[payload] >> 5) & 0x3;
  unit.keyframe = unit.type == 5;
  out.push_back(unit);
  reset();
  return true;
}

void H264Parser::reset() {
  buffer_.clear();
  consumed_ = 0;
}

}  // namespace freehands
