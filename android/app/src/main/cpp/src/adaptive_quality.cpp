#include "freehands/adaptive_quality.h"

namespace freehands {

namespace {
constexpr double kSmoothing = 0.3;

int clampTier(int value) {
  if (value < static_cast<int>(QualityTier::kLow)) {
    return static_cast<int>(QualityTier::kLow);
  }
  if (value > static_cast<int>(QualityTier::kHigh)) {
    return static_cast<int>(QualityTier::kHigh);
  }
  return value;
}
}  // namespace

AdaptiveQuality::AdaptiveQuality() : AdaptiveQuality(Config{}) {}

AdaptiveQuality::AdaptiveQuality(Config config)
    : config_(config),
      tier_(config.initial_tier),
      ewma_ms_(0.0),
      seen_(false),
      in_budget_streak_(0),
      since_change_(0) {}

QualityTier AdaptiveQuality::observe(int64_t latency_ms) {
  const double value =
      latency_ms < 0 ? 0.0 : static_cast<double>(latency_ms);
  if (!seen_) {
    ewma_ms_ = value;
    seen_ = true;
  } else {
    ewma_ms_ = kSmoothing * value + (1.0 - kSmoothing) * ewma_ms_;
  }

  const double budget = static_cast<double>(config_.budget_ms);
  ++since_change_;

  if (ewma_ms_ > budget * config_.down_threshold) {
    in_budget_streak_ = 0;
    if (since_change_ >= config_.cooldown_samples) {
      const int next = clampTier(static_cast<int>(tier_) - 1);
      if (next != static_cast<int>(tier_)) {
        tier_ = static_cast<QualityTier>(next);
        since_change_ = 0;
      }
    }
    return tier_;
  }

  if (ewma_ms_ < budget * config_.up_threshold) {
    ++in_budget_streak_;
    if (in_budget_streak_ >= config_.up_hold_samples &&
        since_change_ >= config_.cooldown_samples) {
      const int next = clampTier(static_cast<int>(tier_) + 1);
      if (next != static_cast<int>(tier_)) {
        tier_ = static_cast<QualityTier>(next);
        since_change_ = 0;
      }
      in_budget_streak_ = 0;
    }
  } else {
    in_budget_streak_ = 0;
  }
  return tier_;
}

bool AdaptiveQuality::setTier(QualityTier tier) {
  const int value = clampTier(static_cast<int>(tier));
  if (value == static_cast<int>(tier_)) {
    return false;
  }
  tier_ = static_cast<QualityTier>(value);
  since_change_ = 0;
  in_budget_streak_ = 0;
  return true;
}

int64_t AdaptiveQuality::smoothedLatencyMs() const {
  return static_cast<int64_t>(ewma_ms_ + 0.5);
}

void AdaptiveQuality::reset() {
  tier_ = config_.initial_tier;
  ewma_ms_ = 0.0;
  seen_ = false;
  in_budget_streak_ = 0;
  since_change_ = 0;
}

AdaptiveQuality::Settings AdaptiveQuality::settings() const {
  return settingsFor(tier_);
}

AdaptiveQuality::Settings AdaptiveQuality::settingsFor(QualityTier tier) {
  switch (tier) {
    case QualityTier::kLow:
      return Settings{540, 960, 1200, 8};
    case QualityTier::kMedium:
      return Settings{720, 1280, 2500, 10};
    case QualityTier::kHigh:
    default:
      return Settings{1080, 1920, 4000, 12};
  }
}

const char* AdaptiveQuality::tierName(QualityTier tier) {
  switch (tier) {
    case QualityTier::kLow:
      return "low";
    case QualityTier::kMedium:
      return "medium";
    case QualityTier::kHigh:
    default:
      return "high";
  }
}

}  // namespace freehands
