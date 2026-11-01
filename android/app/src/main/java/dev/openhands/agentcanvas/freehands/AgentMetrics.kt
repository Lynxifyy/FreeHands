package dev.openhands.agentcanvas.freehands

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONObject

/** Telemetry for one agent step. */
data class AgentStepMetrics(
    val step: Int,
    val promptTokens: Int,
    val completionTokens: Int,
    val latencyMs: Long,
    val success: Boolean,
    val route: InferenceRoute,
) {
    val totalTokens: Int get() = promptTokens + completionTokens
}

/** Rolled-up telemetry for a whole run. */
data class AgentMetricsSnapshot(
    val steps: Int,
    val promptTokens: Int,
    val completionTokens: Int,
    val totalLatencyMs: Long,
    val successes: Int,
    val failures: Int,
    val perRoute: Map<InferenceRoute, Int>,
) {
    val totalTokens: Int get() = promptTokens + completionTokens

    val averageLatencyMs: Long get() = if (steps == 0) 0L else totalLatencyMs / steps

    val successRate: Double get() = if (steps == 0) 0.0 else successes.toDouble() / steps

    /** Renders the rollup for the session log. */
    fun toJson(): JSONObject {
        val routes = JSONObject()
        perRoute.forEach { (route, count) -> routes.put(route.name, count) }
        return JSONObject()
            .put("steps", steps)
            .put("promptTokens", promptTokens)
            .put("completionTokens", completionTokens)
            .put("totalTokens", totalTokens)
            .put("totalLatencyMs", totalLatencyMs)
            .put("averageLatencyMs", averageLatencyMs)
            .put("successes", successes)
            .put("failures", failures)
            .put("successRate", successRate)
            .put("perRoute", routes)
    }
}

/**
 * Collects per-step telemetry so a run can be judged after the fact.
 *
 * The agent's cost and reliability are not visible from the screen, so token
 * use, latency and success rate are accumulated per step and rolled up at the
 * end of a run. Counters are atomic because steps are recorded from the agent
 * thread while the UI may read a snapshot at any time.
 *
 * Token counts come from the inference layer when it reports them, and fall
 * back to [estimateTokens] otherwise: a rough number that still catches a
 * runaway prompt is better than no number at all.
 */
class AgentMetrics {

    private val steps = AtomicInteger()
    private val promptTokens = AtomicInteger()
    private val completionTokens = AtomicInteger()
    private val totalLatencyMs = AtomicLong()
    private val successes = AtomicInteger()
    private val failures = AtomicInteger()
    private val localRequests = AtomicInteger()
    private val cloudRequests = AtomicInteger()

    /** Records one completed step. */
    fun record(step: AgentStepMetrics) {
        steps.incrementAndGet()
        promptTokens.addAndGet(step.promptTokens)
        completionTokens.addAndGet(step.completionTokens)
        totalLatencyMs.addAndGet(step.latencyMs)
        if (step.success) successes.incrementAndGet() else failures.incrementAndGet()
        when (step.route) {
            InferenceRoute.LOCAL -> localRequests.incrementAndGet()
            InferenceRoute.CLOUD -> cloudRequests.incrementAndGet()
        }
    }

    fun snapshot(): AgentMetricsSnapshot {
        val perRoute = mapOf(
            InferenceRoute.LOCAL to localRequests.get(),
            InferenceRoute.CLOUD to cloudRequests.get(),
        ).filterValues { it > 0 }
        return AgentMetricsSnapshot(
            steps = steps.get(),
            promptTokens = promptTokens.get(),
            completionTokens = completionTokens.get(),
            totalLatencyMs = totalLatencyMs.get(),
            successes = successes.get(),
            failures = failures.get(),
            perRoute = perRoute,
        )
    }

    fun reset() {
        steps.set(0)
        promptTokens.set(0)
        completionTokens.set(0)
        totalLatencyMs.set(0)
        successes.set(0)
        failures.set(0)
        localRequests.set(0)
        cloudRequests.set(0)
    }

    companion object {
        /** Characters per token for the estimator. */
        const val CHARACTERS_PER_TOKEN = 4

        /**
         * Rough token count for [text]. English prose averages about four
         * characters per token; this is a budget guard, not a billing figure.
         */
        fun estimateTokens(text: String): Int =
            (text.length + CHARACTERS_PER_TOKEN - 1) / CHARACTERS_PER_TOKEN
    }
}
