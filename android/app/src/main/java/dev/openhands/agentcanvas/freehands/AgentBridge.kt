package dev.openhands.agentcanvas.freehands

import org.json.JSONObject

/** The outcome of one agent step. */
data class AgentStepResult(
    val step: Int,
    val decision: AgentDecision,
    val actionResult: ActionResult?,
    val verification: VerificationResult?,
)

/**
 * What one planner call cost: tokens, latency and the route that served it.
 *
 * Reported separately from [AgentStepResult] because it describes the model
 * call, not the device action, and a planner may be unable to report it at all.
 */
data class PlannerTelemetry(
    val promptTokens: Int,
    val completionTokens: Int,
    val latencyMs: Long,
    val route: InferenceRoute,
)

/** The agent loop: observe, decide, act, verify. */
interface AgentLoop {
    /** Runs until the agent reports done, or [maxSteps] is reached. */
    fun run(goal: String, maxSteps: Int = AgentBridge.DEFAULT_MAX_STEPS): List<AgentStepResult>

    fun cancel()
}

/** Produces the next decision for an observation. Implemented over HTTP or a local model. */
fun interface AgentPlanner {
    fun decide(goal: String, history: List<AgentStepResult>, observation: AgentObservation): AgentDecision

    /**
     * Telemetry for the most recent [decide] call, or null when the planner
     * does not report any. The loop stamps the step number.
     */
    fun lastTelemetry(): PlannerTelemetry? = null
}

/**
 * Bridges the Free Hands device layer and the agent loop.
 *
 * One step is: observe the screen, ask the planner what to do, dispatch the
 * action, then verify the screen changed. Verification feeds back into the next
 * step's history, which is what lets the planner notice that its last action
 * did nothing and try something else.
 *
 * Safety: the loop is bounded by [maxSteps] so a confused planner cannot run
 * forever. Every action still passes through the dispatcher's permission
 * matrix, so the loop never bypasses the tier the user selected. Cancellation
 * is cooperative: it is checked before each step and before each dispatch.
 */
class AgentBridge(
    private val planner: AgentPlanner,
    private val dispatcher: ActionDispatcher,
    private val observer: () -> AgentObservation,
    private val verifier: ActionVerifier? = null,
    private val recorder: SessionRecorder? = null,
    private val metrics: AgentMetrics = AgentMetrics(),
    private val conversation: ConversationManager = ConversationManager(),
    private val maxSteps: Int = DEFAULT_MAX_STEPS,
    /**
     * Consecutive failed steps tolerated before the run stops. A single failure
     * is normal (the screen moved, a tap missed); a run of them means the agent
     * is stuck, and stopping with a recorded reason is better than burning the
     * whole step budget. Zero or less disables the guard.
     */
    private val maxConsecutiveFailures: Int = DEFAULT_MAX_CONSECUTIVE_FAILURES,
) : AgentLoop {

    @Volatile
    private var cancelled = false

    override fun cancel() {
        cancelled = true
    }

    override fun run(goal: String, maxSteps: Int): List<AgentStepResult> {
        cancelled = false
        dispatcher.start()
        // The full run is returned to the caller, but only a bounded window of
        // it is replayed to the planner so the prompt cannot grow without limit.
        val results = mutableListOf<AgentStepResult>()
        // An explicit call-site limit wins; otherwise the constructor value
        // applies, so a caller can bound a run without rebuilding the loop.
        val limit = if (maxSteps != DEFAULT_MAX_STEPS) maxSteps else this.maxSteps
        // Counts steps that ended without a successful action. Reset on success
        // so an occasional miss never accumulates into a false "stuck" verdict.
        var consecutiveFailures = 0

        for (step in 1..limit.coerceAtLeast(1)) {
            if (cancelled) break

            val observation = observer()
            // A planner that throws (a dead model route, a bad response) must
            // not kill the run: record it, count it as a failed step, and let
            // the loop continue so the next call can recover.
            val decision = try {
                planner.decide(goal, conversation.history(), observation)
            } catch (error: Throwable) {
                recorder?.record(
                    SessionRecorder.EVENT_ERROR,
                    JSONObject()
                        .put("stage", "planner")
                        .put("step", step)
                        .put("message", error.message.orEmpty()),
                )
                consecutiveFailures += 1
                val failed = AgentStepResult(
                    step,
                    AgentDecision(
                        thought = "planner error: ${error.message.orEmpty()}",
                        action = null,
                        done = false,
                    ),
                    actionResult = ActionResult.Failed(error.message ?: "planner error"),
                    verification = null,
                )
                conversation.append(failed)
                results += failed
                if (exceededFailureBudget(consecutiveFailures)) {
                    results += stopAfterFailures(step, consecutiveFailures)
                    break
                }
                continue
            }
            val telemetry = planner.lastTelemetry()
            recorder?.record(
                "agent_step",
                JSONObject()
                    .put("step", step)
                    .put("thought", decision.thought)
                    .put("done", decision.done)
                    .put("action", decision.action?.description ?: ""),
            )

            if (decision.done || decision.action == null) {
                recordMetrics(step, decision, telemetry, success = telemetry != null)
                val result = AgentStepResult(step, decision, actionResult = null, verification = null)
                conversation.append(result)
                results += result
                break
            }

            if (cancelled) break

            // The baseline must be captured before the action runs, otherwise
            // the "before" frame already contains the change and verification
            // would report UNCHANGED for every successful action.
            val baseline = verifier?.captureBaseline()
            val actionResult = dispatchAndWait(decision.action)
            val verification = if (actionResult == ActionResult.Success && baseline != null) {
                verifier!!.awaitChange(baseline)
            } else {
                null
            }
            recordMetrics(
                step = step,
                decision = decision,
                telemetry = telemetry,
                success = actionResult == ActionResult.Success,
            )
            val result = AgentStepResult(step, decision, actionResult, verification)
            conversation.append(result)
            results += result

            // A denied or failed action is feedback for the planner, not a
            // reason to end the run — unless it keeps happening.
            consecutiveFailures = if (actionResult == ActionResult.Success) {
                0
            } else {
                consecutiveFailures + 1
            }
            if (exceededFailureBudget(consecutiveFailures)) {
                results += stopAfterFailures(step, consecutiveFailures)
                break
            }
        }

        val snapshot = metrics.snapshot()
        recorder?.record(
            "agent_run_complete",
            JSONObject()
                .put("steps", results.size)
                .put("metrics", snapshot.toJson()),
        )
        return results
    }

    private fun exceededFailureBudget(consecutiveFailures: Int): Boolean =
        maxConsecutiveFailures > 0 && consecutiveFailures >= maxConsecutiveFailures

    /**
     * Closes the run with an explicit "done" step so the UI settles into a
     * clear finished state with a reason, rather than showing a red error that
     * looks like a crash.
     */
    private fun stopAfterFailures(step: Int, failures: Int): AgentStepResult {
        val decision = AgentDecision(
            thought = "Stopping after $failures failed steps in a row.",
            action = null,
            done = true,
        )
        recorder?.record(
            "agent_stopped_on_failures",
            JSONObject().put("step", step).put("consecutiveFailures", failures),
        )
        val result = AgentStepResult(step, decision, actionResult = null, verification = null)
        conversation.append(result)
        return result
    }

    /**
     * Records what the step cost. Token and latency figures come from the
     * planner when it reports them; a planner that reports nothing is still
     * counted, with the thought estimated, so the rollup never silently
     * under-reports a run.
     */
    private fun recordMetrics(
        step: Int,
        decision: AgentDecision,
        telemetry: PlannerTelemetry?,
        success: Boolean,
    ) {
        val estimated = AgentMetrics.estimateTokens(decision.thought)
        metrics.record(
            AgentStepMetrics(
                step = step,
                promptTokens = telemetry?.promptTokens ?: estimated,
                completionTokens = telemetry?.completionTokens ?: estimated,
                latencyMs = telemetry?.latencyMs ?: 0L,
                success = success,
                route = telemetry?.route ?: InferenceRoute.LOCAL,
            ),
        )
    }

    private fun dispatchAndWait(action: AgentAction): ActionResult {
        var result: ActionResult? = null
        val listener = ActionResultListener { _, actionResult -> result = actionResult }
        val accepted = dispatcher.submit(action, listener)
        if (!accepted) {
            return ActionResult.Failed("action queue rejected ${action.description}")
        }
        dispatcher.awaitIdle()
        return result ?: ActionResult.Failed("action did not complete: ${action.description}")
    }

    companion object {
        const val DEFAULT_MAX_STEPS = 25

        /**
         * Consecutive failed steps tolerated before the run stops with an
         * explicit "done" reason. Five gives the planner room to try a few
         * alternatives without letting a stuck agent burn the whole budget.
         */
        const val DEFAULT_MAX_CONSECUTIVE_FAILURES = 5
    }
}
