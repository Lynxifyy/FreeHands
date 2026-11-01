#include <gtest/gtest.h>

#include "freehands/adaptive_quality.h"

namespace freehands {
namespace {

TEST(AdaptiveQualityTest, StartsAtConfiguredTier) {
  AdaptiveQuality quality;
  EXPECT_EQ(quality.tier(), QualityTier::kHigh);
  EXPECT_EQ(quality.settings().width, 1080);
}

TEST(AdaptiveQualityTest, StepsDownWhenLatencyExceedsBudget) {
  AdaptiveQuality quality;
  for (int i = 0; i < 4; ++i) {
    quality.observe(400);
  }
  EXPECT_EQ(quality.tier(), QualityTier::kMedium);

  for (int i = 0; i < 4; ++i) {
    quality.observe(400);
  }
  EXPECT_EQ(quality.tier(), QualityTier::kLow);
}

TEST(AdaptiveQualityTest, NeverStepsBelowLowestTier) {
  AdaptiveQuality quality;
  for (int i = 0; i < 100; ++i) {
    quality.observe(5000);
  }
  EXPECT_EQ(quality.tier(), QualityTier::kLow);
}

TEST(AdaptiveQualityTest, StepsUpAfterSustainedComfortableLatency) {
  AdaptiveQuality::Config config;
  config.initial_tier = QualityTier::kLow;
  AdaptiveQuality quality(config);

  for (int i = 0; i < 20; ++i) {
    quality.observe(10);
  }
  EXPECT_EQ(quality.tier(), QualityTier::kHigh);
}

TEST(AdaptiveQualityTest, DoesNotOscillateAroundTheBoundary) {
  AdaptiveQuality quality;
  // Latency hovering exactly at the budget must not flap the tier.
  for (int i = 0; i < 50; ++i) {
    quality.observe(150);
  }
  EXPECT_EQ(quality.tier(), QualityTier::kHigh);
}

TEST(AdaptiveQualityTest, SmoothedLatencyTracksSamples) {
  AdaptiveQuality quality;
  quality.observe(100);
  EXPECT_EQ(quality.smoothedLatencyMs(), 100);
  quality.observe(0);
  EXPECT_LT(quality.smoothedLatencyMs(), 100);
  EXPECT_GT(quality.smoothedLatencyMs(), 0);
}

TEST(AdaptiveQualityTest, SettingsScaleWithTier) {
  const AdaptiveQuality::Settings low =
      AdaptiveQuality::settingsFor(QualityTier::kLow);
  const AdaptiveQuality::Settings high =
      AdaptiveQuality::settingsFor(QualityTier::kHigh);
  EXPECT_LT(low.width, high.width);
  EXPECT_LT(low.bitrate_kbps, high.bitrate_kbps);
  EXPECT_LT(low.fps, high.fps);
}

TEST(AdaptiveQualityTest, SetTierClampsAndReportsChange) {
  AdaptiveQuality quality;
  EXPECT_TRUE(quality.setTier(QualityTier::kLow));
  EXPECT_EQ(quality.tier(), QualityTier::kLow);
  EXPECT_FALSE(quality.setTier(QualityTier::kLow));
  EXPECT_TRUE(quality.setTier(static_cast<QualityTier>(99)));
  EXPECT_EQ(quality.tier(), QualityTier::kHigh);
}

TEST(AdaptiveQualityTest, ResetReturnsToInitialTier) {
  AdaptiveQuality quality;
  for (int i = 0; i < 6; ++i) {
    quality.observe(400);
  }
  ASSERT_NE(quality.tier(), QualityTier::kHigh);
  quality.reset();
  EXPECT_EQ(quality.tier(), QualityTier::kHigh);
  EXPECT_EQ(quality.smoothedLatencyMs(), 0);
}

TEST(AdaptiveQualityTest, TierNamesAreStable) {
  EXPECT_STREQ(AdaptiveQuality::tierName(QualityTier::kLow), "low");
  EXPECT_STREQ(AdaptiveQuality::tierName(QualityTier::kMedium), "medium");
  EXPECT_STREQ(AdaptiveQuality::tierName(QualityTier::kHigh), "high");
}

}  // namespace
}  // namespace freehands
