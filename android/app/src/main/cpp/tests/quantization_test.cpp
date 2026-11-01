#include "freehands/quantization.h"

#include <cmath>
#include <vector>

#include <gtest/gtest.h>

namespace freehands {
namespace {

TEST(QuantizationTest, FloatTensorsRoundTripExactly) {
  const float values[] = {0.5f, -1.25f, 3.0f, 0.0f};

  const QuantizedTensor tensor = QuantizedTensor::fromFloats(values, 4, Quantization::F32);

  EXPECT_EQ(Quantization::F32, tensor.precision());
  EXPECT_EQ(4u, tensor.count());
  EXPECT_FLOAT_EQ(0.5f, tensor.at(0));
  EXPECT_FLOAT_EQ(-1.25f, tensor.at(1));
  EXPECT_FLOAT_EQ(3.0f, tensor.at(2));
}

TEST(QuantizationTest, Q8UsesOneBytePerWeight) {
  const std::vector<float> values(64, 1.0f);

  const QuantizedTensor tensor =
      QuantizedTensor::fromFloats(values.data(), values.size(), Quantization::Q8);

  EXPECT_EQ(64u, tensor.bytes());
  EXPECT_NEAR(1.0f, tensor.at(0), 0.02f);
}

TEST(QuantizationTest, Q4UsesHalfABytePerWeight) {
  const std::vector<float> values(64, 1.0f);

  const QuantizedTensor tensor =
      QuantizedTensor::fromFloats(values.data(), values.size(), Quantization::Q4);

  EXPECT_EQ(32u, tensor.bytes());
  EXPECT_NEAR(1.0f, tensor.at(0), 0.1f);
}

TEST(QuantizationTest, Q4ApproximatesASpreadOfValues) {
  std::vector<float> values(32);
  for (size_t i = 0; i < values.size(); ++i) {
    values[i] = static_cast<float>(i) / 31.0f;
  }

  const QuantizedTensor tensor =
      QuantizedTensor::fromFloats(values.data(), values.size(), Quantization::Q4);

  for (size_t i = 0; i < values.size(); ++i) {
    EXPECT_NEAR(values[i], tensor.at(i), 0.1f) << "index " << i;
  }
}

TEST(QuantizationTest, DequantizeFillsTheWholeTensor) {
  const std::vector<float> values(40, 2.0f);
  const QuantizedTensor tensor =
      QuantizedTensor::fromFloats(values.data(), values.size(), Quantization::Q4);
  std::vector<float> out(40, 0.0f);

  const size_t written = tensor.dequantize(out.data(), out.size());

  EXPECT_EQ(40u, written);
  EXPECT_NEAR(2.0f, out[0], 0.1f);
}

TEST(QuantizationTest, DequantizeHonoursASmallerOutputBuffer) {
  const std::vector<float> values(40, 2.0f);
  const QuantizedTensor tensor =
      QuantizedTensor::fromFloats(values.data(), values.size(), Quantization::Q8);
  std::vector<float> out(8, 0.0f);

  EXPECT_EQ(8u, tensor.dequantize(out.data(), out.size()));
}

TEST(QuantizationTest, ReadsBeyondTheCountAsZero) {
  const float values[] = {1.0f};
  const QuantizedTensor tensor = QuantizedTensor::fromFloats(values, 1, Quantization::Q8);

  EXPECT_FLOAT_EQ(0.0f, tensor.at(1));
}

TEST(QuantizationTest, AConstantTensorStillQuantizesToItsValue) {
  const std::vector<float> values(32, -4.0f);

  const QuantizedTensor tensor =
      QuantizedTensor::fromFloats(values.data(), values.size(), Quantization::Q4);

  // A constant block has no range; the value must still survive.
  EXPECT_NEAR(-4.0f, tensor.at(0), 0.01f);
  EXPECT_NEAR(-4.0f, tensor.at(31), 0.01f);
}

TEST(QuantizationTest, FromQuantizedKeepsTheProvidedTables) {
  std::vector<uint8_t> data{3, 7};
  std::vector<float> scales{0.5f};
  std::vector<float> zero_points{1.0f};

  const QuantizedTensor tensor = QuantizedTensor::fromQuantized(
      std::move(data), std::move(scales), std::move(zero_points), 2, Quantization::Q8);

  EXPECT_EQ(2u, tensor.count());
  EXPECT_FLOAT_EQ(1.0f, tensor.at(0));   // (3 - 1) * 0.5
  EXPECT_FLOAT_EQ(3.0f, tensor.at(1));   // (7 - 1) * 0.5
}

TEST(QuantizationTest, AnEmptyTensorQuantizesToNothing) {
  const QuantizedTensor tensor = QuantizedTensor::fromFloats(nullptr, 0, Quantization::Q4);

  EXPECT_EQ(0u, tensor.count());
  EXPECT_EQ(0u, tensor.bytes());
}

}  // namespace
}  // namespace freehands
