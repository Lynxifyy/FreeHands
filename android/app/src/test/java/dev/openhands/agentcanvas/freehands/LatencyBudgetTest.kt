package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LatencyBudgetTest {

    @Test
    fun `defaults to the end to end target`() {
        val budget = LatencyBudget()

        val snapshot = budget.snapshot()

        assertEquals(LatencyBudget.DEFAULT_BUDGET_MS, snapshot.budgetMs)
        assertEquals(0L, snapshot.totalMs)
        assertEquals(LatencyBudget.DEFAULT_BUDGET_MS, snapshot.remainingMs)
        assertTrue(snapshot.withinBudget)
    }

    @Test
    fun `sums stage durations against the budget`() {
        val budget = LatencyBudget()
        budget.record(FeedStage.CAPTURE, 20)
            .record(FeedStage.ENCODE, 30)
            .record(FeedStage.TRANSMIT, 40)

        val snapshot = budget.snapshot()

        assertEquals(90L, snapshot.totalMs)
        assertEquals(60L, snapshot.remainingMs)
        assertTrue(snapshot.withinBudget)
        assertEquals(20L, snapshot.stage(FeedStage.CAPTURE))
    }

    @Test
    fun `reports exceeded budget and clamps remaining to zero`() {
        val budget = LatencyBudget(100)
        budget.record(FeedStage.CAPTURE, 80).record(FeedStage.ENCODE, 80)

        val snapshot = budget.snapshot()

        assertEquals(160L, snapshot.totalMs)
        assertEquals(0L, snapshot.remainingMs)
        assertFalse(snapshot.withinBudget)
    }

    @Test
    fun `smooths repeated samples instead of jumping`() {
        val budget = LatencyBudget()
        budget.record(FeedStage.DECODE, 100)
        budget.record(FeedStage.DECODE, 0)

        // EWMA(0.2): 100 -> 80, so one outlier does not pin the stage.
        assertEquals(80L, budget.snapshot().stage(FeedStage.DECODE))
    }

    @Test
    fun `treats negative durations as zero`() {
        val budget = LatencyBudget()
        budget.record(FeedStage.ANALYZE, -20)

        assertEquals(0L, budget.snapshot().stage(FeedStage.ANALYZE))
    }

    @Test
    fun `merges native stats while keeping the local transmit stage`() {
        val budget = LatencyBudget()
        budget.record(FeedStage.TRANSMIT, 25)

        budget.mergeNativeStats(
            longArrayOf(150, 120, 30, 10, 20, 999, 40, 50, 5),
        )

        val snapshot = budget.snapshot()
        assertEquals(10L, snapshot.stage(FeedStage.CAPTURE))
        assertEquals(20L, snapshot.stage(FeedStage.ENCODE))
        assertEquals(25L, snapshot.stage(FeedStage.TRANSMIT))
        assertEquals(40L, snapshot.stage(FeedStage.DECODE))
        assertEquals(50L, snapshot.stage(FeedStage.ANALYZE))
        assertEquals(145L, snapshot.totalMs)
        assertEquals(5L, snapshot.samples)
    }

    @Test
    fun `ignores a truncated native stats array`() {
        val budget = LatencyBudget()
        budget.record(FeedStage.CAPTURE, 12)

        budget.mergeNativeStats(longArrayOf(150, 0, 0))

        assertEquals(12L, budget.snapshot().stage(FeedStage.CAPTURE))
    }

    @Test
    fun `reset clears every stage`() {
        val budget = LatencyBudget()
        budget.record(FeedStage.CAPTURE, 90)

        budget.reset()

        assertEquals(0L, budget.snapshot().totalMs)
        assertEquals(0L, budget.snapshot().samples)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `rejects a non positive budget`() {
        LatencyBudget(0)
    }
}
