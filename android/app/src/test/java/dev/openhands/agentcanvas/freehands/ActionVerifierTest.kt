package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionVerifierTest {

    private class FakeFrameSource(private var frame: LumaFrame?) : FrameSource {
        fun update(next: LumaFrame?) {
            frame = next
        }

        override fun latest(): LumaFrame? = frame
    }

    /** Advances a fake clock on each sleep so the wait window terminates. */
    private class FakeClock(private val stepMs: Long) {
        private var now = 0L
        val clock: () -> Long = { now }
        val sleep: (Long) -> Unit = { now += stepMs }
    }

    @Test
    fun `verifies when the screen changes`() {
        val source = FakeFrameSource(LumaFrame.uniform(32, 32, 0))
        val fake = FakeClock(20)
        val verifier = ActionVerifier(
            source,
            sleep = fake.sleep,
            clock = fake.clock,
            pollIntervalMs = 10,
            waitWindowMs = 200,
        )

        val baseline = verifier.captureBaseline()
        source.update(LumaFrame(32, 32, IntArray(32 * 32) { 255 }))

        val result = verifier.awaitChange(baseline)

        assertEquals(VerificationOutcome.VERIFIED, result.outcome)
    }

    @Test
    fun `reports unchanged when nothing moves before the deadline`() {
        val source = FakeFrameSource(LumaFrame.uniform(32, 32, 7))
        val fake = FakeClock(50)
        val verifier = ActionVerifier(
            source,
            sleep = fake.sleep,
            clock = fake.clock,
            pollIntervalMs = 10,
            waitWindowMs = 100,
        )

        val baseline = verifier.captureBaseline()
        val result = verifier.awaitChange(baseline)

        assertEquals(VerificationOutcome.UNCHANGED, result.outcome)
        assertTrue(result.waitedMs >= 100)
    }

    @Test
    fun `is inconclusive without a baseline`() {
        val source = FakeFrameSource(null)
        val verifier = ActionVerifier(source)

        val result = verifier.awaitChange(null)

        assertEquals(VerificationOutcome.INCONCLUSIVE, result.outcome)
    }

    @Test
    fun `reports the change percentage in the detail`() {
        val source = FakeFrameSource(LumaFrame.uniform(32, 32, 0))
        val fake = FakeClock(20)
        val verifier = ActionVerifier(
            source,
            sleep = fake.sleep,
            clock = fake.clock,
            pollIntervalMs = 10,
            waitWindowMs = 200,
        )
        val baseline = verifier.captureBaseline()
        source.update(LumaFrame(32, 32, IntArray(32 * 32) { 255 }))

        val result = verifier.awaitChange(baseline)

        assertTrue(result.detail.contains("%"))
    }
}
