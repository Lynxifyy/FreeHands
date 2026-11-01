#ifndef FREEHANDS_TESTS_MODEL_FIXTURE_H
#define FREEHANDS_TESTS_MODEL_FIXTURE_H

// Builds a tiny, fully-formed `.litertlm` model in memory.
//
// The engine tests need a real model file to load: a hand-written stub would
// exercise the loader but not the forward pass. This builder writes the same
// container the loader reads, with dimensions small enough to run a full
// generation in a test (a handful of layers and a vocabulary of a few dozen
// pieces), so the whole path is covered without shipping a multi-gigabyte
// checkpoint.

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "freehands/model.h"

namespace freehands {
namespace testing {

struct FixtureConfig {
  int d_model = 8;
  int d_ffn = 16;
  int n_layers = 2;
  int n_heads = 2;
  int vocab_size = 16;
  int max_context = 64;
  int32_t eos_token = 1;
  int32_t bos_token = 0;
  Quantization precision = Quantization::F32;
  // Seed for the deterministic weight fill.
  uint32_t seed = 12345;
};

// Appends [value] to [buffer] in host byte order, which is what the loader
// reads back.
template <typename T>
void append(std::vector<uint8_t>* buffer, const T& value) {
  const auto* raw = reinterpret_cast<const uint8_t*>(&value);
  buffer->insert(buffer->end(), raw, raw + sizeof(T));
}

inline uint32_t nextRandom(uint32_t* state) {
  uint32_t x = *state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *state = x == 0 ? 0x9E3779B9u : x;
  return *state;
}

// A small deterministic weight in [-0.5, 0.5).
inline float randomWeight(uint32_t* state) {
  const uint32_t raw = nextRandom(state);
  return (static_cast<float>(raw % 1000) / 1000.0f) - 0.5f;
}

// The pieces the fixture vocabulary is built from. Every piece is prefixed with
// the SentencePiece boundary marker so "a" encodes to exactly one token.
inline std::vector<std::string> fixtureVocabulary(int size) {
  std::vector<std::string> pieces;
  pieces.reserve(static_cast<size_t>(size));
  // Id 0 is the beginning of sequence, id 1 the end of sequence, and the rest
  // are single letters so the tokenizer always finds a match.
  pieces.emplace_back("<s>");
  pieces.emplace_back("</s>");
  for (int i = 2; i < size; ++i) {
    // Start at 'a' so the first letters of the fixture prompts are all
    // encodable, which the engine tests rely on. The tokenizer prepends the
    // boundary marker, so the pieces themselves must not carry one.
    std::string piece;
    piece.push_back(static_cast<char>('a' + ((i - 2) % 26)));
    pieces.push_back(piece);
  }
  return pieces;
}

inline size_t storedBytes(Quantization precision, size_t count) {
  switch (precision) {
    case Quantization::Q4:
      return (count + 1) / 2;
    case Quantization::Q8:
      return count;
    case Quantization::F32:
      return count * sizeof(float);
  }
  return count * sizeof(float);
}

// Appends [count] quantized weights in the layout the loader expects: the
// packed data followed by the per-block scales and zero points.
inline void appendWeights(std::vector<uint8_t>* buffer, size_t count,
                          Quantization precision, uint32_t* state) {
  if (precision == Quantization::F32) {
    for (size_t i = 0; i < count; ++i) {
      append(buffer, randomWeight(state));
    }
    return;
  }
  const int max_code = precision == Quantization::Q4 ? 15 : 255;
  const size_t blocks = (count + QuantizedTensor::kBlockSize - 1) /
                        QuantizedTensor::kBlockSize;
  std::vector<uint8_t> codes(count, 0);
  std::vector<float> scales(blocks, 1.0f);
  std::vector<float> zero_points(blocks, 0.0f);
  for (size_t i = 0; i < count; ++i) {
    // A bounded weight keeps the affine mapping invertible for every block.
    const float value = randomWeight(state);
    const float scale = 1.0f / static_cast<float>(max_code);
    scales[i / QuantizedTensor::kBlockSize] = scale;
    zero_points[i / QuantizedTensor::kBlockSize] = static_cast<float>(max_code) / 2.0f;
    const float code = value / scale + zero_points[i / QuantizedTensor::kBlockSize];
    codes[i] = static_cast<uint8_t>(
        std::max(0.0f, std::min(static_cast<float>(max_code), code)));
  }
  if (precision == Quantization::Q4) {
    for (size_t i = 0; i < count; i += 2) {
      const uint8_t low = codes[i] & 0x0F;
      const uint8_t high = (i + 1 < count) ? (codes[i + 1] & 0x0F) : 0;
      buffer->push_back(static_cast<uint8_t>(low | (high << 4)));
    }
  } else {
    buffer->insert(buffer->end(), codes.begin(), codes.end());
  }
  for (const float scale : scales) {
    append(buffer, scale);
  }
  for (const float zero : zero_points) {
    append(buffer, zero);
  }
}

// Builds a complete model file. [out] is overwritten.
inline void buildModel(const FixtureConfig& config, std::vector<uint8_t>* out) {
  const auto pieces = fixtureVocabulary(config.vocab_size);
  const size_t vocab = static_cast<size_t>(config.vocab_size);
  const size_t dim = static_cast<size_t>(config.d_model);
  const size_t ffn = static_cast<size_t>(config.d_ffn);

  std::string header = "{";
  header += "\"name\":\"fixture\",";
  header += "\"d_model\":" + std::to_string(config.d_model) + ",";
  header += "\"d_ffn\":" + std::to_string(config.d_ffn) + ",";
  header += "\"n_layers\":" + std::to_string(config.n_layers) + ",";
  header += "\"n_heads\":" + std::to_string(config.n_heads) + ",";
  header += "\"vocab_size\":" + std::to_string(config.vocab_size) + ",";
  header += "\"max_context\":" + std::to_string(config.max_context) + ",";
  header += "\"eos_token\":" + std::to_string(config.eos_token) + ",";
  header += "\"bos_token\":" + std::to_string(config.bos_token) + ",";
  header += "\"precision\":\"";
  header += config.precision == Quantization::Q4
                ? "q4"
                : (config.precision == Quantization::Q8 ? "q8" : "f32");
  header += "\"}";

  std::vector<uint8_t> buffer;
  buffer.insert(buffer.end(), ModelLoader::kMagic, ModelLoader::kMagic + 8);
  append(&buffer, ModelLoader::kVersion);
  append(&buffer, static_cast<uint32_t>(header.size()));
  buffer.insert(buffer.end(), header.begin(), header.end());

  uint32_t state = config.seed;

  // Vocabulary: a length-prefixed entry per id.
  for (const std::string& piece : pieces) {
    append(&buffer, static_cast<uint16_t>(piece.size()));
    buffer.insert(buffer.end(), piece.begin(), piece.end());
  }

  // Embedding table, always float, since it is the input path.
  for (size_t i = 0; i < vocab * dim; ++i) {
    append(&buffer, randomWeight(&state));
  }

  for (int layer = 0; layer < config.n_layers; ++layer) {
    appendWeights(&buffer, dim * dim, config.precision, &state);  // q
    appendWeights(&buffer, dim * dim, config.precision, &state);  // k
    appendWeights(&buffer, dim * dim, config.precision, &state);  // v
    appendWeights(&buffer, dim * dim, config.precision, &state);  // o
    appendWeights(&buffer, dim * ffn, config.precision, &state);  // up
    appendWeights(&buffer, ffn * dim, config.precision, &state);  // down
    // Norms are always float and initialized to one so the norm is a no-op
    // scaling and the test's expectations stay readable.
    for (size_t i = 0; i < dim; ++i) {
      append(&buffer, 1.0f);
    }
    for (size_t i = 0; i < dim; ++i) {
      append(&buffer, 1.0f);
    }
  }

  appendWeights(&buffer, vocab * dim, config.precision, &state);

  *out = std::move(buffer);
}

// Writes the fixture to a temporary file and returns its path. The caller owns
// the file.
inline std::string writeModelFile(const FixtureConfig& config, const std::string& path) {
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  FILE* file = std::fopen(path.c_str(), "wb");
  if (file == nullptr) {
    return "";
  }
  std::fwrite(bytes.data(), 1, bytes.size(), file);
  std::fclose(file);
  return path;
}

}  // namespace testing
}  // namespace freehands

#endif  // FREEHANDS_TESTS_MODEL_FIXTURE_H
