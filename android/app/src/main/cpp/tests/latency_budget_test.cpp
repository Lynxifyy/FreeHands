#include <gtest/gtest.h>

#include "freehands/latency_budget.h"

namespace freehands {
namespace {

TEST(LatencyBudgetTest, DefaultsToTheEndToEndTarget) {
  LatencyBudget budget;
  EXPECT_EQ(budget.budgetMs(), 150);
  EXPECT_TRUE(budget.withinBudget());
  EXPECT_EQ(budget.totalMs(), 0);
  EXPECT_EQ(budget.remainingMs(), 150);
}

TEST(LatencyBudgetTest, SumsSmoothedStageDurations) {
  LatencyBudget budget(150);
  budget.record(LatencyBudget::kCapture, 20);
  budget.record(LatencyBudget::kEncode, 30);
  budget.record(LatencyBudget::kTransmit, 40);

  EXPECT_EQ(budget.stageMs(LatencyBudget::kCapture), 20);
  EXPECT_EQ(budget.stageMs(LatencyBudget::kEncode), 30);
  EXPECT_EQ(budget.stageMs(LatencyBudget::kTransmit), 40);
  EXPECT_EQ(budget.totalMs(), 90);
  EXPECT_EQ(budget.remainingMs(), 60);
  EXPECT_TRUE(budget.withinBudget());
}

TEST(LatencyBudgetTest, ReportsExceededBudgetAndClampsRemaining) {
  LatencyBudget budget(100);
  budget.record(LatencyBudget::kCapture, 80);
  budget.record(LatencyBudget::kEncode, 80);

  EXPECT_GT(budget.totalMs(), 100);
  EXPECT_FALSE(budget.withinBudget());
  EXPECT_EQ(budget.remainingMs(), 0);
}

TEST(LatencyBudgetTest, SmoothsRepeatedSamplesInsteadOfJumping) {
  LatencyBudget budget(150);
  budget.record(LatencyBudget::kDecode, 100);
  budget.record(LatencyBudget::kDecode, 0);

  // EWMA(0.2): 100 -> 80, so one outlier does not pin the stage at 100.
  EXPECT_EQ(budget.stageMs(LatencyBudget::kDecode), 80);
}

TEST(LatencyBudgetTest, RejectsNonPositiveBudget) {
  LatencyBudget budget(150);
  EXPECT_FALSE(budget.setBudgetMs(0));
  EXPECT_FALSE(budget.setBudgetMs(-5));
  EXPECT_EQ(budget.budgetMs(), 150);
  EXPECT_TRUE(budget.setBudgetMs(200));
  EXPECT_EQ(budget.budgetMs(), 200);
}

TEST(LatencyBudgetTest, IgnoresOutOfRangeStage) {
  LatencyBudget budget(150);
  budget.recordStage(-1, 500);
  budget.recordStage(LatencyBudget::kStageCount, 500);
  EXPECT_EQ(budget.totalMs(), 0);
  EXPECT_EQ(budget.sampleCount(), 0u);
}

TEST(LatencyBudgetTest, TreatsNegativeDurationAsZero) {
  LatencyBudget budget(150);
  budget.record(LatencyBudget::kAnalyze, -20);
  EXPECT_EQ(budget.stageMs(LatencyBudget::kAnalyze), 0);
  EXPECT_EQ(budget.sampleCount(), 1u);
}

TEST(LatencyBudgetTest, SnapshotCapturesEveryStage) {
  LatencyBudget budget(150);
  budget.record(LatencyBudget::kCapture, 10);
  budget.record(LatencyBudget::kEncode, 20);
  budget.record(LatencyBudget::kTransmit, 30);
  budget.record(LatencyBudget::kDecode, 40);
  budget.record(LatencyBudget::kAnalyze, 50);

  const LatencyBudget::Stats stats = budget.snapshot();
  EXPECT_EQ(stats.budget_ms, 150);
  EXPECT_EQ(stats.total_ms, 150);
  EXPECT_EQ(stats.remaining_ms, 0);
  EXPECT_TRUE(stats.within_budget);
  EXPECT_EQ(stats.stage_ms[0], 10);
  EXPECT_EQ(stats.stage_ms[4], 50);
  EXPECT_EQ(stats.samples, 5u);
}

TEST(LatencyBudgetTest, ResetClearsEveryStage) {
  LatencyBudget budget(150);
  budget.record(LatencyBudget::kCapture, 90);
  budget.reset();

  EXPECT_EQ(budget.totalMs(), 0);
  EXPECT_EQ(budget.sampleCount(), 0u);
  EXPECT_EQ(budget.stageMs(LatencyBudget::kCapture), 0);
}

}  // namespace
}  // namespace freehands
