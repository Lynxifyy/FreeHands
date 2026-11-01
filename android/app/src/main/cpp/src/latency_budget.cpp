#include "freehands/latency_budget.h"

namespace freehands {

LatencyBudget::LatencyBudget(int64_t budget_ms)
    : budget_ms_(budget_ms > 0 ? budget_ms : kDefaultBudgetMs),
      ewma_ms_{},
      seen_{},
      samples_(0) {}

bool LatencyBudget::setBudgetMs(int64_t budget_ms) {
  if (budget_ms <= 0) {
    return false;
  }
  budget_ms_ = budget_ms;
  return true;
}

void LatencyBudget::recordStage(int stage, int64_t duration_ms) {
  if (stage < 0 || stage >= kStageCount) {
    return;
  }
  record(static_cast<Stage>(stage), duration_ms);
}

void LatencyBudget::record(Stage stage, int64_t duration_ms) {
  const int idx = static_cast<int>(stage);
  if (idx < 0 || idx >= kStageCount) {
    return;
  }
  const double value = duration_ms < 0 ? 0.0 : static_cast<double>(duration_ms);
  if (!seen_[idx]) {
    ewma_ms_[idx] = value;
    seen_[idx] = true;
  } else {
    ewma_ms_[idx] = kSmoothing * value + (1.0 - kSmoothing) * ewma_ms_[idx];
  }
  ++samples_;
}

int64_t LatencyBudget::stageMs(int stage) const {
  if (stage < 0 || stage >= kStageCount) {
    return 0;
  }
  return static_cast<int64_t>(ewma_ms_[stage] + 0.5);
}

int64_t LatencyBudget::totalMs() const {
  double sum = 0.0;
  for (double value : ewma_ms_) {
    sum += value;
  }
  return static_cast<int64_t>(sum + 0.5);
}

bool LatencyBudget::withinBudget() const { return totalMs() <= budget_ms_; }

int64_t LatencyBudget::remainingMs() const {
  const int64_t remaining = budget_ms_ - totalMs();
  return remaining < 0 ? 0 : remaining;
}

void LatencyBudget::reset() {
  ewma_ms_.fill(0.0);
  seen_.fill(false);
  samples_ = 0;
}

LatencyBudget::Stats LatencyBudget::snapshot() const {
  Stats stats;
  stats.budget_ms = budget_ms_;
  stats.total_ms = totalMs();
  stats.remaining_ms = remainingMs();
  for (int i = 0; i < kStageCount; ++i) {
    stats.stage_ms[i] = stageMs(i);
  }
  stats.within_budget = withinBudget();
  stats.samples = samples_;
  return stats;
}

}  // namespace freehands
