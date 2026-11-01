#ifndef FREEHANDS_LATENCY_BUDGET_H
#define FREEHANDS_LATENCY_BUDGET_H

#include <array>
#include <cstdint>

namespace freehands {

// Tracks the end-to-end latency of the live-feed pipeline:
// capture -> encode -> transmit -> decode -> analyze.
//
// Each stage keeps a smoothed (EWMA) duration so a single slow frame does not
// flip the pipeline into a degraded state, while a sustained regression does.
class LatencyBudget {
 public:
  static constexpr int64_t kDefaultBudgetMs = 150;
  static constexpr int kStageCount = 5;
  static constexpr double kSmoothing = 0.2;

  enum Stage : int {
    kCapture = 0,
    kEncode = 1,
    kTransmit = 2,
    kDecode = 3,
    kAnalyze = 4,
  };

  // Immutable snapshot handed across the JNI boundary.
  struct Stats {
    int64_t budget_ms = kDefaultBudgetMs;
    int64_t total_ms = 0;
    int64_t remaining_ms = 0;
    int64_t stage_ms[kStageCount] = {0, 0, 0, 0, 0};
    bool within_budget = true;
    uint64_t samples = 0;
  };

  explicit LatencyBudget(int64_t budget_ms = kDefaultBudgetMs);

  int64_t budgetMs() const { return budget_ms_; }

  // Rejects non-positive budgets so the budget can never be unusable.
  bool setBudgetMs(int64_t budget_ms);

  void record(Stage stage, int64_t duration_ms);

  // Index-based variant used by the JNI layer, which passes stage as an int.
  void recordStage(int stage, int64_t duration_ms);

  int64_t stageMs(int stage) const;

  // Sum of every stage's smoothed duration.
  int64_t totalMs() const;

  // Budget left after totalMs(); clamped at zero once the budget is exceeded.
  int64_t remainingMs() const;

  bool withinBudget() const;

  uint64_t sampleCount() const { return samples_; }

  Stats snapshot() const;

  void reset();

 private:
  int64_t budget_ms_;
  std::array<double, kStageCount> ewma_ms_;
  std::array<bool, kStageCount> seen_;
  uint64_t samples_;
};

}  // namespace freehands

#endif  // FREEHANDS_LATENCY_BUDGET_H
