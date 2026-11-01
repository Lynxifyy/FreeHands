#include "freehands/tokenizer.h"

namespace freehands {

namespace {

// The SentencePiece word-boundary marker, U+2581, in UTF-8.
constexpr char kBoundary[] = "\xE2\x96\x81";

// Byte-fallback pieces are written as "<0xAB>".
int32_t parseByteFallback(const std::string& piece) {
  if (piece.size() != 6 || piece[0] != '<' || piece[1] != '0' || piece[2] != 'x' ||
      piece[5] != '>') {
    return -1;
  }
  const auto hex = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  const int high = hex(piece[3]);
  const int low = hex(piece[4]);
  if (high < 0 || low < 0) {
    return -1;
  }
  return high * 16 + low;
}

}  // namespace

const char* Tokenizer::boundary() { return kBoundary; }

Tokenizer Tokenizer::fromPieces(const std::vector<std::string>& pieces) {
  Tokenizer tokenizer;
  tokenizer.pieces_ = pieces;
  tokenizer.index_.reserve(pieces.size() * 2);
  for (size_t i = 0; i < pieces.size(); ++i) {
    // The first id wins, matching the model's own tie-break.
    tokenizer.index_.emplace(pieces[i], static_cast<int32_t>(i));
  }
  return tokenizer;
}

size_t Tokenizer::registerByteFallbacks() {
  size_t registered = 0;
  for (size_t i = 0; i < pieces_.size(); ++i) {
    const int32_t value = parseByteFallback(pieces_[i]);
    if (value >= 0 && value <= 0xFF) {
      byte_fallback_.emplace(static_cast<uint8_t>(value), static_cast<int32_t>(i));
      ++registered;
    }
  }
  return registered;
}

std::vector<int32_t> Tokenizer::encode(const std::string& text) const {
  std::vector<int32_t> ids;
  if (pieces_.empty()) {
    return ids;
  }

  // Split on spaces so the boundary marker lands at the start of each word,
  // then greedily match the longest piece that fits.
  std::string word;
  const auto flush = [&]() {
    if (word.empty()) {
      return;
    }
    // Prefix the boundary marker unless the word already carries one. Without
    // the guard, the marker bytes ("\xE2\x96\x81") run straight into a piece
    // that begins with a hex digit and the C++ literal swallows those digits,
    // so a vocabulary piece like "\x81abc" is never matched.
    const bool marked = word.rfind(kBoundary, 0) == 0;
    std::string current = marked ? word : std::string(kBoundary) + word;
    size_t offset = 0;
    while (offset < current.size()) {
      size_t length = std::min(kMaxPieceBytes, current.size() - offset);
      int32_t matched = -1;
      size_t matched_length = 0;
      // Do not cut a UTF-8 sequence in half: back off to a lead byte boundary.
      for (size_t candidate = length; candidate >= 1; --candidate) {
        const auto last = static_cast<uint8_t>(current[offset + candidate - 1]);
        if ((last & 0xC0) == 0x80) {
          continue;
        }
        const std::string piece = current.substr(offset, candidate);
        const auto found = index_.find(piece);
        if (found != index_.end()) {
          matched = found->second;
          matched_length = candidate;
          break;
        }
      }
      if (matched >= 0) {
        ids.push_back(matched);
        offset += matched_length;
        continue;
      }
      // No piece matched: fall back to the single byte.
      const auto byte = static_cast<uint8_t>(current[offset]);
      const auto fallback = byte_fallback_.find(byte);
      if (fallback != byte_fallback_.end()) {
        ids.push_back(fallback->second);
      }
      ++offset;
    }
    word.clear();
  };

  for (const char character : text) {
    if (character == ' ') {
      flush();
    } else {
      word.push_back(character);
    }
  }
  flush();
  return ids;
}

std::string Tokenizer::decode(const std::vector<int32_t>& ids) const {
  std::string text;
  for (const int32_t id : ids) {
    if (id < 0 || static_cast<size_t>(id) >= pieces_.size()) {
      continue;
    }
    const std::string& piece = pieces_[static_cast<size_t>(id)];
    if (piece.rfind(kBoundary, 0) == 0) {
      if (!text.empty()) {
        text.push_back(' ');
      }
      text += piece.substr(3);
    } else {
      text += piece;
    }
  }
  return text;
}

std::string Tokenizer::piece(int32_t id) const {
  if (id < 0 || static_cast<size_t>(id) >= pieces_.size()) {
    return "";
  }
  const std::string& raw = pieces_[static_cast<size_t>(id)];
  if (raw.rfind(kBoundary, 0) == 0) {
    return raw.substr(3);
  }
  return raw;
}

}  // namespace freehands
