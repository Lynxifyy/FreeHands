#ifndef FREEHANDS_ADAPTIVE_QUALITY_H
#define FREEHANDS_ADAPTIVE_QUALITY_H

#include <cstdint>
#include <string>

namespace freehands {

// Stream quality tiers, ordered from cheapest to richest. The numeric order is
// meaningful: the controller steps one tier at a time between neighbours.
enum class QualityTier : int {
  kLow = 0,
  kMedium = 1,
  kHigh = 2,
};

// Chooses a resolution/bitrate tier that fits the end-to-end latency budget.
//
// The controller reacts to the measured transmission+decode latency: when the
// smoothed latency exceeds the budget it steps quality down, and when it has
// comfortably fit the budget for several consecutive samples it steps back up.
// Hysteresis (a down/up threshold pair plus a cool-down) stops the tier from
// oscillating around the boundary.
class AdaptiveQuality {
 public:
  struct Config {
    int64_t budget_ms = 150;
    // Step down when smoothed latency exceeds this fraction of the budget.
    double down_threshold = 1.0;
    // Step up only when smoothed latency is below this fraction of the budget.
    double up_threshold = 0.6;
    // Consecutive in-budget samples required before stepping up.
    int up_hold_samples = 5;
    // Minimum samples between two tier changes.
    int cooldown_samples = 3;
    QualityTier initial_tier = QualityTier::kHigh;
  };

  struct Settings {
    int width;
    int height;
    int bitrate_kbps;
    int fps;
  };

  AdaptiveQuality();
  explicit AdaptiveQuality(Config config);

  // Feeds one latency measurement and returns the resulting tier.
  QualityTier observe(int64_t latency_ms);

  QualityTier tier() const { return tier_; }

  Settings settings() const;

  // Clamps a caller-provided tier to the supported range.
  bool setTier(QualityTier tier);

  int64_t smoothedLatencyMs() const;

  void reset();

  static Settings settingsFor(QualityTier tier);

  static const char* tierName(QualityTier tier);

 private:
  Config config_;
  QualityTier tier_;
  double ewma_ms_;
  bool seen_;
  int in_budget_streak_;
  int since_change_;
};

}  // namespace freehands

#endif  // FREEHANDS_ADAPTIVE_QUALITY_H
