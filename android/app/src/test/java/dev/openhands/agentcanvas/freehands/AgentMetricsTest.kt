package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentMetricsTest {

    private fun step(
        index: Int,
        prompt: Int = 100,
        completion: Int = 20,
        latency: Long = 50,
        success: Boolean = true,
        route: InferenceRoute = InferenceRoute.LOCAL,
    ) = AgentStepMetrics(index, prompt, completion, latency, success, route)

    @Test
    fun `an unused collector reports a zeroed snapshot`() {
        val snapshot = AgentMetrics().snapshot()

        assertEquals(0, snapshot.steps)
        assertEquals(0, snapshot.totalTokens)
        assertEquals(0L, snapshot.averageLatencyMs)
        assertEquals(0.0, snapshot.successRate, 0.0)
    }

    @Test
    fun `sums tokens and latency across steps`() {
        val metrics = AgentMetrics()

        metrics.record(step(1, prompt = 100, completion = 20, latency = 40))
        metrics.record(step(2, prompt = 200, completion = 30, latency = 60))

        val snapshot = metrics.snapshot()
        assertEquals(2, snapshot.steps)
        assertEquals(300, snapshot.promptTokens)
        assertEquals(50, snapshot.completionTokens)
        assertEquals(350, snapshot.totalTokens)
        assertEquals(100L, snapshot.totalLatencyMs)
        assertEquals(50L, snapshot.averageLatencyMs)
    }

    @Test
    fun `counts successes and failures`() {
        val metrics = AgentMetrics()

        metrics.record(step(1, success = true))
        metrics.record(step(2, success = false))
        metrics.record(step(3, success = false))
        metrics.record(step(4, success = true))

        val snapshot = metrics.snapshot()
        assertEquals(2, snapshot.successes)
        assertEquals(2, snapshot.failures)
        assertEquals(0.5, snapshot.successRate, 0.0001)
    }

    @Test
    fun `counts requests per route`() {
        val metrics = AgentMetrics()

        metrics.record(step(1, route = InferenceRoute.LOCAL))
        metrics.record(step(2, route = InferenceRoute.LOCAL))
        metrics.record(step(3, route = InferenceRoute.CLOUD))

        val perRoute = metrics.snapshot().perRoute
        assertEquals(2, perRoute[InferenceRoute.LOCAL])
        assertEquals(1, perRoute[InferenceRoute.CLOUD])
    }

    @Test
    fun `estimates tokens from the character count`() {
        assertEquals(0, AgentMetrics.estimateTokens(""))
        assertEquals(1, AgentMetrics.estimateTokens("abcd"))
        assertEquals(2, AgentMetrics.estimateTokens("abcde"))
        assertEquals(25, AgentMetrics.estimateTokens("x".repeat(100)))
    }

    @Test
    fun `reset clears the counters`() {
        val metrics = AgentMetrics()
        metrics.record(step(1))

        metrics.reset()

        assertEquals(0, metrics.snapshot().steps)
    }

    @Test
    fun `a snapshot serialises the rollup for the session log`() {
        val metrics = AgentMetrics()
        metrics.record(step(1, prompt = 10, completion = 5, latency = 30, route = InferenceRoute.CLOUD))

        val json = metrics.snapshot().toJson()

        assertEquals(1, json.getInt("steps"))
        assertEquals(15, json.getInt("totalTokens"))
        assertEquals(30L, json.getLong("totalLatencyMs"))
        assertEquals(1, json.getJSONObject("perRoute").getInt("CLOUD"))
        assertTrue(json.getDouble("successRate") > 0.0)
    }
}
