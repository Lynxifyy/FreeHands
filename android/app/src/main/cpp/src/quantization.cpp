#include "freehands/quantization.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace freehands {

namespace {

// Maps a float range onto 0..max_code, the affine quantization LiteRT uses.
struct Affine {
  float scale = 1.0f;
  float zero_point = 0.0f;
};

Affine computeAffine(const float* data, size_t begin, size_t end, int max_code) {
  float minimum = data[begin];
  float maximum = data[begin];
  for (size_t i = begin; i < end; ++i) {
    minimum = std::min(minimum, data[i]);
    maximum = std::max(maximum, data[i]);
  }
  Affine affine;
  if (maximum <= minimum) {
    // A constant block has no range to map, so the scale carries the value and
    // the zero point sits at whichever end reproduces its sign. Choosing a
    // usable scale here is what keeps a constant block decoding back to its own
    // value instead of collapsing to zero.
    const float magnitude = std::max(std::fabs(minimum), 1e-8f);
    affine.scale = magnitude / static_cast<float>(max_code);
    affine.zero_point = minimum > 0.0f ? 0.0f : static_cast<float>(max_code);
    return affine;
  }
  affine.scale = (maximum - minimum) / static_cast<float>(max_code);
  // Round the zero point so an exact zero stays exact where possible.
  affine.zero_point = std::round(-minimum / affine.scale);
  affine.zero_point = std::clamp(affine.zero_point, 0.0f, static_cast<float>(max_code));
  return affine;
}

}  // namespace

QuantizedTensor QuantizedTensor::fromFloats(const float* data, size_t count,
                                            Quantization precision) {
  QuantizedTensor tensor;
  tensor.precision_ = precision;
  tensor.count_ = count;
  if (data == nullptr || count == 0) {
    return tensor;
  }

  if (precision == Quantization::F32) {
    tensor.data_.resize(count * sizeof(float));
    std::memcpy(tensor.data_.data(), data, count * sizeof(float));
    return tensor;
  }

  const int max_code = precision == Quantization::Q4 ? 15 : 255;
  const size_t blocks = (count + kBlockSize - 1) / kBlockSize;
  tensor.scales_.resize(blocks);
  tensor.zero_points_.resize(blocks);

  if (precision == Quantization::Q8) {
    tensor.data_.resize(count);
    for (size_t block = 0; block < blocks; ++block) {
      const size_t begin = block * kBlockSize;
      const size_t end = std::min(begin + kBlockSize, count);
      const Affine affine = computeAffine(data, begin, end, max_code);
      tensor.scales_[block] = affine.scale;
      tensor.zero_points_[block] = affine.zero_point;
      for (size_t i = begin; i < end; ++i) {
        const float code = std::round(data[i] / affine.scale + affine.zero_point);
        tensor.data_[i] = static_cast<uint8_t>(
            std::clamp(code, 0.0f, static_cast<float>(max_code)));
      }
    }
    return tensor;
  }

  // Q4: two nibbles per byte, low nibble first.
  tensor.data_.assign((count + 1) / 2, 0);
  for (size_t block = 0; block < blocks; ++block) {
    const size_t begin = block * kBlockSize;
    const size_t end = std::min(begin + kBlockSize, count);
    const Affine affine = computeAffine(data, begin, end, max_code);
    tensor.scales_[block] = affine.scale;
    tensor.zero_points_[block] = affine.zero_point;
    for (size_t i = begin; i < end; ++i) {
      const float code = std::round(data[i] / affine.scale + affine.zero_point);
      const auto nibble = static_cast<uint8_t>(
          std::clamp(code, 0.0f, static_cast<float>(max_code)));
      if ((i & 1U) == 0U) {
        tensor.data_[i / 2] = static_cast<uint8_t>(tensor.data_[i / 2] | nibble);
      } else {
        tensor.data_[i / 2] =
            static_cast<uint8_t>(tensor.data_[i / 2] | static_cast<uint8_t>(nibble << 4));
      }
    }
  }
  return tensor;
}

QuantizedTensor QuantizedTensor::fromQuantized(std::vector<uint8_t> data,
                                               std::vector<float> scales,
                                               std::vector<float> zero_points,
                                               size_t count,
                                               Quantization precision) {
  QuantizedTensor tensor;
  tensor.data_ = std::move(data);
  tensor.scales_ = std::move(scales);
  tensor.zero_points_ = std::move(zero_points);
  tensor.count_ = count;
  tensor.precision_ = precision;
  return tensor;
}

float QuantizedTensor::at(size_t index) const {
  if (index >= count_) {
    return 0.0f;
  }
  const size_t block = index / kBlockSize;
  const float scale = block < scales_.size() ? scales_[block] : 1.0f;
  const float zero_point = block < zero_points_.size() ? zero_points_[block] : 0.0f;

  switch (precision_) {
    case Quantization::F32: {
      float value = 0.0f;
      if (index * sizeof(float) + sizeof(float) <= data_.size()) {
        std::memcpy(&value, data_.data() + index * sizeof(float), sizeof(float));
      }
      return value;
    }
    case Quantization::Q8: {
      if (index >= data_.size()) {
        return 0.0f;
      }
      return (static_cast<float>(data_[index]) - zero_point) * scale;
    }
    case Quantization::Q4: {
      const size_t byte_index = index / 2;
      if (byte_index >= data_.size()) {
        return 0.0f;
      }
      const uint8_t packed = data_[byte_index];
      const uint8_t nibble = (index & 1U) == 0U
                                 ? static_cast<uint8_t>(packed & 0x0F)
                                 : static_cast<uint8_t>((packed >> 4) & 0x0F);
      return (static_cast<float>(nibble) - zero_point) * scale;
    }
  }
  return 0.0f;
}

size_t QuantizedTensor::dequantize(float* out, size_t out_count) const {
  if (out == nullptr) {
    return 0;
  }
  const size_t limit = std::min(out_count, count_);
  for (size_t i = 0; i < limit; ++i) {
    out[i] = at(i);
  }
  return limit;
}

}  // namespace freehands
