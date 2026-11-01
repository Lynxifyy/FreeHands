#include "freehands/litert_engine.h"

#include <cstdio>
#include <limits>
#include <memory>
#include <string>
#include <vector>
#include <unistd.h>

#include <gtest/gtest.h>

#include "freehands/kernel_backend.h"
#include "model_fixture.h"

namespace freehands {
namespace {

using testing::FixtureConfig;
using testing::writeModelFile;

class LiteRTEngineTest : public ::testing::Test {
 protected:
  void SetUp() override {
    path_ = "/tmp/freehands-engine-test-" + std::to_string(::getpid()) + ".litertlm";
    reconfigure(LiteRTEngine::Config{});
  }

  void TearDown() override { std::remove(path_.c_str()); }

  // Rebuilds the engine with [config]. The engine owns a mutex and a pool, so
  // it is replaced rather than assigned.
  void reconfigure(const LiteRTEngine::Config& config) {
    engine_ = std::make_unique<LiteRTEngine>(config);
  }

  bool loadFixture(const FixtureConfig& config) {
    if (writeModelFile(config, path_).empty()) {
      return false;
    }
    std::string error;
    return engine_->loadModel(path_, &error);
  }

  std::string path_;
  std::unique_ptr<LiteRTEngine> engine_;
};

TEST_F(LiteRTEngineTest, IsNotReadyBeforeAModelIsLoaded) {
  EXPECT_FALSE(engine_->isReady());
  EXPECT_EQ(nullptr, engine_->model());
}

TEST_F(LiteRTEngineTest, BecomesReadyAfterLoadingAModel) {
  ASSERT_TRUE(loadFixture(FixtureConfig{}));

  EXPECT_TRUE(engine_->isReady());
  EXPECT_EQ(8, engine_->model()->d_model);
}

TEST_F(LiteRTEngineTest, LoadsFromABuffer) {
  std::vector<uint8_t> bytes;
  testing::buildModel(FixtureConfig{}, &bytes);
  std::string error;

  EXPECT_TRUE(engine_->loadModelFromBuffer(bytes.data(), bytes.size(), &error)) << error;
  EXPECT_TRUE(engine_->isReady());
}

TEST_F(LiteRTEngineTest, GeneratesWithoutAModelReturnsNothing) {
  EXPECT_EQ("", engine_->generate("hello"));
}

TEST_F(LiteRTEngineTest, GeneratesBoundedTextFromAPrompt) {
  LiteRTEngine::Config config;
  config.max_tokens = 4;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));

  const std::string text = engine_->generate("tap a button");

  EXPECT_LE(text.size(), 64u);
  const GenerationStats stats = engine_->lastStats();
  EXPECT_GT(stats.prompt_tokens, 0u);
  EXPECT_LE(stats.generated_tokens, 4u);
}

TEST_F(LiteRTEngineTest, ReportsPrefillAndDecodeTimings) {
  LiteRTEngine::Config config;
  config.max_tokens = 3;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));

  engine_->generate("a b c");

  const GenerationStats stats = engine_->lastStats();
  EXPECT_GE(stats.prefill_ms, 0.0);
  EXPECT_GE(stats.decode_ms, 0.0);
  EXPECT_GE(stats.tokens_per_second, 0.0);
}

TEST_F(LiteRTEngineTest, StreamsEveryTokenToTheCallback) {
  LiteRTEngine::Config config;
  config.max_tokens = 5;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));
  std::vector<std::string> pieces;

  engine_->generate("a b", nullptr, [&pieces](int32_t, const std::string& text) {
    pieces.push_back(text);
    return true;
  });

  EXPECT_FALSE(pieces.empty());
  EXPECT_LE(pieces.size(), 5u);
}

TEST_F(LiteRTEngineTest, ARejectedCallbackStopsGeneration) {
  LiteRTEngine::Config config;
  config.max_tokens = 50;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));
  int calls = 0;

  const std::string text = engine_->generate("a b", nullptr, [&calls](int32_t, const std::string&) {
    ++calls;
    return false;
  });

  EXPECT_EQ(1, calls);
  EXPECT_LE(engine_->lastStats().generated_tokens, 1u);
  (void)text;
}

TEST_F(LiteRTEngineTest, CancelStopsAGeneration) {
  LiteRTEngine::Config config;
  config.max_tokens = 1000;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));

  // Cancel from the first token: generation must not run to the token cap.
  engine_->generate("a b", nullptr, [this](int32_t, const std::string&) {
    engine_->cancel();
    return true;
  });

  EXPECT_LT(engine_->lastStats().generated_tokens, 1000u);
}

TEST_F(LiteRTEngineTest, CurrentTextTracksTheStreamedOutput) {
  LiteRTEngine::Config config;
  config.max_tokens = 3;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));

  const std::string text = engine_->generate("a b");

  EXPECT_EQ(text, engine_->currentText());
}

TEST_F(LiteRTEngineTest, ResetClearsTheCachedState) {
  LiteRTEngine::Config config;
  config.max_tokens = 2;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));
  engine_->generate("a b");

  engine_->reset();

  EXPECT_TRUE(engine_->currentText().empty());
}

TEST_F(LiteRTEngineTest, UsesTheCpuBackendByDefault) {
  EXPECT_STREQ("cpu", engine_->backendName());
}

TEST_F(LiteRTEngineTest, AnInstalledBackendIsReportedByName) {
  class StubBackend final : public KernelBackend {
   public:
    void matmul(const MatrixView&, const MatrixView&, float*) const override {}
    void axpy(float*, const float*, const float*, const float*, size_t, float) const override {}
    const char* name() const override { return "stub-gpu"; }
  } stub;

  engine_->setBackend(&stub);
  EXPECT_STREQ("stub-gpu", engine_->backendName());

  engine_->setBackend(nullptr);
  EXPECT_STREQ("cpu", engine_->backendName());
}

TEST_F(LiteRTEngineTest, LoadsAndRunsAQuantizedModel) {
  FixtureConfig fixture;
  fixture.precision = Quantization::Q4;
  LiteRTEngine::Config config;
  config.max_tokens = 3;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(fixture));

  const std::string text = engine_->generate("a b");

  EXPECT_LE(text.size(), 64u);
  EXPECT_GT(engine_->lastStats().prompt_tokens, 0u);
}

TEST_F(LiteRTEngineTest, GreedySamplingIsDeterministic) {
  LiteRTEngine::Config config;
  config.temperature = 0.0f;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(FixtureConfig{}));

  const std::string first = engine_->generate("a b c");
  engine_->reset();
  const std::string second = engine_->generate("a b c");

  EXPECT_EQ(first, second);
}

TEST_F(LiteRTEngineTest, TheContextWindowBoundsALongPrompt) {
  FixtureConfig fixture;
  fixture.max_context = 4;
  LiteRTEngine::Config config;
  config.max_tokens = 1;
  reconfigure(config);
  ASSERT_TRUE(loadFixture(fixture));

  engine_->generate("a b c d e f g h i j k l");

  EXPECT_LE(engine_->lastStats().prompt_tokens, 4u);
}

TEST(LiteRTEngineStaticTest, GreedySamplingPicksTheLargestLogit) {
  const float logits[] = {0.1f, 3.0f, 0.2f, -1.0f};

  EXPECT_EQ(1, LiteRTEngine::sampleToken(logits, 4, 0.0f, nullptr));
}

TEST(LiteRTEngineStaticTest, GreedySamplingBreaksTiesByLowestIndex) {
  const float logits[] = {2.0f, 2.0f};

  EXPECT_EQ(0, LiteRTEngine::sampleToken(logits, 2, 0.0f, nullptr));
}

TEST(LiteRTEngineStaticTest, SamplingWithNoLogitsReturnsNothing) {
  EXPECT_EQ(-1, LiteRTEngine::sampleToken(nullptr, 0, 0.0f, nullptr));
}

TEST(LiteRTEngineStaticTest, SoftmaxProducesADistribution) {
  float values[] = {1.0f, 2.0f, 3.0f};

  LiteRTEngine::softmax(values, 3);

  double total = 0.0;
  for (const float value : values) {
    EXPECT_GT(value, 0.0f);
    total += value;
  }
  EXPECT_NEAR(1.0, total, 1e-5);
  EXPECT_GT(values[2], values[0]);
}

TEST(LiteRTEngineStaticTest, SoftmaxOfAMaskedRowIsUniform) {
  float values[] = {-std::numeric_limits<float>::infinity(),
                    -std::numeric_limits<float>::infinity()};

  LiteRTEngine::softmax(values, 2);

  EXPECT_FLOAT_EQ(0.5f, values[0]);
  EXPECT_FLOAT_EQ(0.5f, values[1]);
}

TEST(LiteRTEngineStaticTest, SoftmaxToleratesAnEmptyRow) {
  float value = 0.0f;

  LiteRTEngine::softmax(&value, 0);

  EXPECT_FLOAT_EQ(0.0f, value);
}

}  // namespace
}  // namespace freehands
