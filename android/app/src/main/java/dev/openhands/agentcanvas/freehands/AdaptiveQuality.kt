package dev.openhands.agentcanvas.freehands

/** Encoder/stream settings for one quality tier. */
data class QualitySettings(
    val width: Int,
    val height: Int,
    val bitrateKbps: Int,
    val fps: Int,
)

/** Stream quality tiers, ordered cheapest to richest. */
enum class QualityTier(val index: Int, val settings: QualitySettings) {
    LOW(0, QualitySettings(width = 540, height = 960, bitrateKbps = 1200, fps = 8)),
    MEDIUM(1, QualitySettings(width = 720, height = 1280, bitrateKbps = 2500, fps = 10)),
    HIGH(2, QualitySettings(width = 1080, height = 1920, bitrateKbps = 4000, fps = 12));

    companion object {
        fun fromIndex(index: Int): QualityTier =
            entries[index.coerceIn(0, entries.lastIndex)]
    }
}

/**
 * Chooses the effective stream tier for the live feed.
 *
 * Two inputs bound the tier: the native capture pipeline's own decision (read
 * back from the bridge) and a network cap measured on the socket here. The
 * effective tier is the cheaper of the two, so a congested socket can lower
 * quality without the native controller having to see the network at all.
 */
class AdaptiveQuality(
    private val budgetMs: Long = LatencyBudget.DEFAULT_BUDGET_MS,
    initialTier: QualityTier = QualityTier.HIGH,
) {
    private val ewma = DoubleArray(1)
    private var seen = false
    private var inBudgetStreak = 0
    private var sinceChange = 0
    private var networkCap = initialTier
    private var nativeTier = initialTier

    /** Feeds one transport latency sample and returns the resulting network cap. */
    fun observeTransportLatency(latencyMs: Long): QualityTier {
        val value = latencyMs.coerceAtLeast(0L).toDouble()
        ewma[0] = if (seen) SMOOTHING * value + (1 - SMOOTHING) * ewma[0] else value
        seen = true
        sinceChange++

        if (ewma[0] > budgetMs * DOWN_THRESHOLD) {
            inBudgetStreak = 0
            if (sinceChange >= COOLDOWN_SAMPLES) {
                networkCap = step(-1)
                sinceChange = 0
            }
            return networkCap
        }

        if (ewma[0] < budgetMs * UP_THRESHOLD) {
            inBudgetStreak++
            if (inBudgetStreak >= UP_HOLD_SAMPLES && sinceChange >= COOLDOWN_SAMPLES) {
                networkCap = step(1)
                sinceChange = 0
                inBudgetStreak = 0
            }
        } else {
            inBudgetStreak = 0
        }
        return networkCap
    }

    private fun step(direction: Int): QualityTier {
        val next = QualityTier.fromIndex(networkCap.index + direction)
        return next
    }

    /** Applies the tier reported by the native capture pipeline. */
    fun applyNativeTier(tier: QualityTier) {
        nativeTier = tier
    }

    /** The tier actually used: the cheaper of the native tier and the network cap. */
    fun effectiveTier(): QualityTier = QualityTier.fromIndex(minOf(nativeTier.index, networkCap.index))

    fun settings(): QualitySettings = effectiveTier().settings

    fun smoothedTransportLatencyMs(): Long = kotlin.math.round(ewma[0]).toLong()

    fun reset() {
        ewma.fill(0.0)
        seen = false
        inBudgetStreak = 0
        sinceChange = 0
        networkCap = QualityTier.HIGH
        nativeTier = QualityTier.HIGH
    }

    companion object {
        const val SMOOTHING = 0.3
        const val DOWN_THRESHOLD = 1.0
        const val UP_THRESHOLD = 0.6
        const val UP_HOLD_SAMPLES = 5
        const val COOLDOWN_SAMPLES = 3
    }
}
