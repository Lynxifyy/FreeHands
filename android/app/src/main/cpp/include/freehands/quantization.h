#ifndef FREEHANDS_QUANTIZATION_H
#define FREEHANDS_QUANTIZATION_H

#include <cstddef>
#include <cstdint>
#include <vector>

namespace freehands {

// Weight storage precision.
enum class Quantization : int {
  F32 = 32,
  Q8 = 8,
  Q4 = 4,
};

// A tensor stored in one of the supported precisions.
//
// Q8 keeps one signed byte per weight. Q4 packs two unsigned nibbles per byte
// with the scale and zero point per block, which is the layout the quantized
// LiteRT checkpoints use. Both are decoded back to float for the matmul, so the
// kernels stay single-precision and only the storage shrinks.
class QuantizedTensor {
 public:
  // Weights per quantization block. One scale and one zero point per block.
  static constexpr size_t kBlockSize = 32;

  QuantizedTensor() = default;

  // Quantizes [count] floats at [precision]. Q4 requires an even count; the
  // last nibble of an odd tensor is left zero and ignored on dequantize.
  static QuantizedTensor fromFloats(const float* data, size_t count, Quantization precision);

  // Builds a tensor from already-quantized data. Used by the model loader when
  // the file stores weights in this format.
  static QuantizedTensor fromQuantized(std::vector<uint8_t> data,
                                       std::vector<float> scales,
                                       std::vector<float> zero_points,
                                       size_t count,
                                       Quantization precision);

  Quantization precision() const { return precision_; }
  size_t count() const { return count_; }
  size_t bytes() const { return data_.size(); }

  // Decodes the whole tensor to floats. Returns the number of values written.
  size_t dequantize(float* out, size_t out_count) const;

  // Decodes one value. Out-of-range indexes return 0.
  float at(size_t index) const;

 private:
  std::vector<uint8_t> data_;
  std::vector<float> scales_;
  std::vector<float> zero_points_;
  size_t count_ = 0;
  Quantization precision_ = Quantization::F32;
};

}  // namespace freehands

#endif  // FREEHANDS_QUANTIZATION_H
