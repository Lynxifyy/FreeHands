#ifndef FREEHANDS_MODEL_H
#define FREEHANDS_MODEL_H

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "freehands/kernel_backend.h"
#include "freehands/quantization.h"
#include "freehands/tokenizer.h"

namespace freehands {

// One transformer layer's weights.
struct ModelLayer {
  // [d_model, d_model]
  QuantizedTensor attention_q;
  QuantizedTensor attention_k;
  QuantizedTensor attention_v;
  QuantizedTensor attention_output;
  // [d_model, d_ffn] and [d_ffn, d_model]
  QuantizedTensor ffn_up;
  QuantizedTensor ffn_down;
  // [d_model]
  std::vector<float> attention_norm;
  std::vector<float> ffn_norm;
  float epsilon = 1e-5f;
};

// A decoded model: the dimensions, the embedding table, the layers and the
// output head. Weights are held in their stored precision and dequantized a row
// at a time during the matmul, so a 4-bit checkpoint keeps its memory saving
// even while it runs.
struct Model {
  std::string name;
  int d_model = 0;
  int d_ffn = 0;
  int n_layers = 0;
  int n_heads = 0;
  int vocab_size = 0;
  int max_context = 0;
  // Token id that ends a generation.
  int32_t eos_token = -1;
  // Id that starts a sequence, when the model uses one.
  int32_t bos_token = -1;

  Quantization weight_precision = Quantization::F32;
  // Token pieces in id order, the table the tokenizer encodes against.
  std::vector<std::string> vocabulary;
  std::vector<float> token_embedding;  // [vocab_size, d_model]
  std::vector<ModelLayer> layers;
  QuantizedTensor output_head;  // [vocab_size, d_model]

  bool valid() const {
    return d_model > 0 && n_layers > 0 && vocab_size > 0 &&
           token_embedding.size() == static_cast<size_t>(vocab_size) * d_model &&
           vocabulary.size() == static_cast<size_t>(vocab_size);
  }

  // Size of the weights in bytes, for the memory report.
  size_t weightBytes() const;
};

// Reads a model from a `.litertlm` file.
//
// The container is a small binary header followed by the tensors:
//
//   magic    8 bytes  "FREEHLM\0"
//   version  uint32   currently 1
//   header   uint32   byte length of the JSON header that follows
//   json     header   {"name":..,"d_model":..,"weights":{"precision":"q4"}}
//   tensors           the raw tensor bytes in the order the header lists
//
// The JSON header keeps the format readable and lets a newer writer add fields
// without breaking an older reader. A file whose magic or version does not
// match is refused with an error rather than partially loaded, because a
// half-loaded model produces plausible-looking garbage output.
class ModelLoader {
 public:
  static constexpr char kMagic[8] = {'F', 'R', 'E', 'E', 'H', 'L', 'M', '\0'};
  static constexpr uint32_t kVersion = 1;
  // magic + version + header length.
  static constexpr size_t kHeaderBytes = 16;

  // Loads [path]. On failure returns false and writes a reason to [error].
  static bool load(const std::string& path, Model* model, std::string* error);

  // Loads from a buffer, for tests and for loading from memory.
  static bool loadFromBuffer(const uint8_t* data, size_t length, Model* model,
                             std::string* error);
};

}  // namespace freehands

#endif  // FREEHANDS_MODEL_H
