#ifndef FREEHANDS_TOKENIZER_H
#define FREEHANDS_TOKENIZER_H

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace freehands {

// Byte-pair-encoding tokenizer over a loaded vocabulary.
//
// The vocabulary is the piece table from the model file: one entry per token id.
// Encoding is greedy longest-match with a bounded window, which is what the
// SentencePiece unigram path reduces to for the vocabularies these models ship.
//
// The word boundary marker (U+2581, the SentencePiece space) is prepended to
// the first piece of every word, so "hello world" and "world hello" do not
// share the "world" piece, matching how the model was trained.
class Tokenizer {
 public:
  // Longest piece length considered, in bytes of UTF-8.
  static constexpr size_t kMaxPieceBytes = 32;

  Tokenizer() = default;

  // Builds a tokenizer from the vocabulary in id order. Ids are the entry
  // index, so the file must list pieces in the model's id order.
  static Tokenizer fromPieces(const std::vector<std::string>& pieces);

  // Maps every byte that is not a piece by itself to its byte-fallback token.
  // Returns the number of fallbacks registered.
  size_t registerByteFallbacks();

  bool empty() const { return pieces_.empty(); }
  size_t size() const { return pieces_.size(); }

  // Encodes text to token ids. An unknown byte becomes the byte-fallback token
  // when one is registered, otherwise it is skipped, so encoding never fails.
  std::vector<int32_t> encode(const std::string& text) const;

  // Decodes ids back to text, joining pieces and turning the boundary marker
  // back into a space.
  std::string decode(const std::vector<int32_t>& ids) const;

  // One decoded piece, for the streaming callback.
  std::string piece(int32_t id) const;

 private:
  std::vector<std::string> pieces_;
  std::unordered_map<std::string, int32_t> index_;
  // Byte value -> token id, for bytes with no piece of their own.
  std::unordered_map<uint8_t, int32_t> byte_fallback_;

  static const char* boundary();
};

}  // namespace freehands

#endif  // FREEHANDS_TOKENIZER_H
