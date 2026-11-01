#include "freehands/model.h"

#include <cstdio>
#include <string>
#include <vector>

#include <gtest/gtest.h>

#include "model_fixture.h"

namespace freehands {
namespace {

using testing::FixtureConfig;
using testing::buildModel;

TEST(ModelLoaderTest, LoadsAWellFormedModel) {
  FixtureConfig config;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  Model model;
  std::string error;

  ASSERT_TRUE(ModelLoader::loadFromBuffer(bytes.data(), bytes.size(), &model, &error)) << error;

  EXPECT_EQ(config.d_model, model.d_model);
  EXPECT_EQ(config.n_layers, model.n_layers);
  EXPECT_EQ(config.vocab_size, model.vocab_size);
  EXPECT_EQ(config.eos_token, model.eos_token);
  EXPECT_TRUE(model.valid());
}

TEST(ModelLoaderTest, LoadsTheVocabularyInIdOrder) {
  FixtureConfig config;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  Model model;
  std::string error;

  ASSERT_TRUE(ModelLoader::loadFromBuffer(bytes.data(), bytes.size(), &model, &error)) << error;

  ASSERT_EQ(static_cast<size_t>(config.vocab_size), model.vocabulary.size());
  EXPECT_EQ("<s>", model.vocabulary[0]);
  EXPECT_EQ("</s>", model.vocabulary[1]);
}

TEST(ModelLoaderTest, LoadsAQuantizedModel) {
  FixtureConfig config;
  config.precision = Quantization::Q4;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  Model model;
  std::string error;

  ASSERT_TRUE(ModelLoader::loadFromBuffer(bytes.data(), bytes.size(), &model, &error)) << error;

  EXPECT_EQ(Quantization::Q4, model.weight_precision);
  EXPECT_EQ(Quantization::Q4, model.layers[0].attention_q.precision());
}

TEST(ModelLoaderTest, QuantizedWeightsAreSmallerThanFloat) {
  FixtureConfig float_config;
  std::vector<uint8_t> float_bytes;
  buildModel(float_config, &float_bytes);

  FixtureConfig quantized_config;
  quantized_config.precision = Quantization::Q4;
  std::vector<uint8_t> quantized_bytes;
  buildModel(quantized_config, &quantized_bytes);

  EXPECT_LT(quantized_bytes.size(), float_bytes.size());
}

TEST(ModelLoaderTest, RejectsAFileWithTheWrongSignature) {
  FixtureConfig config;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  bytes[0] = 'X';
  Model model;
  std::string error;

  EXPECT_FALSE(ModelLoader::loadFromBuffer(bytes.data(), bytes.size(), &model, &error));
  EXPECT_FALSE(error.empty());
}

TEST(ModelLoaderTest, RejectsAFutureVersion) {
  FixtureConfig config;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  const uint32_t future = ModelLoader::kVersion + 1;
  std::memcpy(bytes.data() + 8, &future, sizeof(future));
  Model model;
  std::string error;

  EXPECT_FALSE(ModelLoader::loadFromBuffer(bytes.data(), bytes.size(), &model, &error));
  EXPECT_NE(std::string::npos, error.find("version"));
}

TEST(ModelLoaderTest, RejectsATruncatedFile) {
  FixtureConfig config;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  Model model;
  std::string error;

  EXPECT_FALSE(
      ModelLoader::loadFromBuffer(bytes.data(), bytes.size() / 2, &model, &error));
  EXPECT_FALSE(error.empty());
}

TEST(ModelLoaderTest, RejectsAnEmptyBuffer) {
  Model model;
  std::string error;

  EXPECT_FALSE(ModelLoader::loadFromBuffer(nullptr, 0, &model, &error));
  EXPECT_FALSE(error.empty());
}

TEST(ModelLoaderTest, ReportsAMissingFile) {
  Model model;
  std::string error;

  EXPECT_FALSE(ModelLoader::load("/nonexistent/freehands/model.litertlm", &model, &error));
  EXPECT_NE(std::string::npos, error.find("not found"));
}

TEST(ModelLoaderTest, LoadsFromAPath) {
  FixtureConfig config;
  const std::string path = "/tmp/freehands-model-loader-test.litertlm";
  ASSERT_EQ(path, testing::writeModelFile(config, path));
  Model model;
  std::string error;

  ASSERT_TRUE(ModelLoader::load(path, &model, &error)) << error;
  std::remove(path.c_str());

  EXPECT_TRUE(model.valid());
}

TEST(ModelLoaderTest, ReportsTheWeightSize) {
  FixtureConfig config;
  std::vector<uint8_t> bytes;
  buildModel(config, &bytes);
  Model model;
  std::string error;
  ASSERT_TRUE(ModelLoader::loadFromBuffer(bytes.data(), bytes.size(), &model, &error)) << error;

  EXPECT_GT(model.weightBytes(), 0u);
}

}  // namespace
}  // namespace freehands
