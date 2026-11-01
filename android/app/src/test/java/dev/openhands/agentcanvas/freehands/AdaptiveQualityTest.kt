package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdaptiveQualityTest {

    @Test
    fun `starts at the highest tier`() {
        val quality = AdaptiveQuality()

        assertEquals(QualityTier.HIGH, quality.effectiveTier())
        assertEquals(1080, quality.settings().width)
    }

    @Test
    fun `steps down after sustained over-budget latency`() {
        val quality = AdaptiveQuality()

        repeat(AdaptiveQuality.COOLDOWN_SAMPLES) { quality.observeTransportLatency(400) }
        assertEquals(QualityTier.MEDIUM, quality.effectiveTier())

        repeat(AdaptiveQuality.COOLDOWN_SAMPLES) { quality.observeTransportLatency(400) }
        assertEquals(QualityTier.LOW, quality.effectiveTier())
    }

    @Test
    fun `never steps below the lowest tier`() {
        val quality = AdaptiveQuality()

        repeat(200) { quality.observeTransportLatency(5000) }

        assertEquals(QualityTier.LOW, quality.effectiveTier())
    }

    @Test
    fun `does not flap when latency hovers at the budget`() {
        val quality = AdaptiveQuality()

        repeat(200) { quality.observeTransportLatency(LatencyBudget.DEFAULT_BUDGET_MS) }

        assertEquals(QualityTier.HIGH, quality.effectiveTier())
    }

    @Test
    fun `steps back up after a sustained comfortable window`() {
        val quality = AdaptiveQuality()
        repeat(AdaptiveQuality.COOLDOWN_SAMPLES * 4) { quality.observeTransportLatency(4000) }
        assertEquals(QualityTier.LOW, quality.effectiveTier())

        repeat(AdaptiveQuality.UP_HOLD_SAMPLES + AdaptiveQuality.COOLDOWN_SAMPLES + 10) {
            quality.observeTransportLatency(5)
        }

        assertTrue(quality.effectiveTier().index > QualityTier.LOW.index)
    }

    @Test
    fun `effective tier is the cheaper of the native tier and the network cap`() {
        val quality = AdaptiveQuality()
        quality.applyNativeTier(QualityTier.LOW)

        assertEquals(QualityTier.LOW, quality.effectiveTier())
        assertEquals(QualityTier.LOW.settings, quality.settings())
    }

    @Test
    fun `reset restores the highest tier`() {
        val quality = AdaptiveQuality()
        repeat(AdaptiveQuality.COOLDOWN_SAMPLES * 4) { quality.observeTransportLatency(4000) }
        assertFalse(quality.effectiveTier() == QualityTier.HIGH)

        quality.reset()

        assertEquals(QualityTier.HIGH, quality.effectiveTier())
        assertEquals(0L, quality.smoothedTransportLatencyMs())
    }

    @Test
    fun `settings scale with the tier`() {
        val low = QualityTier.LOW.settings
        val high = QualityTier.HIGH.settings

        assertTrue(low.width < high.width)
        assertTrue(low.bitrateKbps < high.bitrateKbps)
        assertTrue(low.fps < high.fps)
    }

    @Test
    fun `tier from index clamps at both ends`() {
        assertEquals(QualityTier.LOW, QualityTier.fromIndex(-5))
        assertEquals(QualityTier.HIGH, QualityTier.fromIndex(99))
        assertEquals(QualityTier.MEDIUM, QualityTier.fromIndex(1))
    }
}
