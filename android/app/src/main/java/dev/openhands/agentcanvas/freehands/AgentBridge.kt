package dev.openhands.agentcanvas.freehands

import org.json.JSONObject

/** The outcome of one agent step. */
data class AgentStepResult(
    val step: Int,
    val decision: AgentDecision,
    val actionResult: ActionResult?,
    val verification: VerificationResult?,
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
    private val maxSteps: Int = DEFAULT_MAX_STEPS,
) : AgentLoop {

    @Volatile
    private var cancelled = false

    override fun cancel() {
        cancelled = true
    }

    override fun run(goal: String, maxSteps: Int): List<AgentStepResult> {
        cancelled = false
        dispatcher.start()
        val history = mutableListOf<AgentStepResult>()
        val limit = maxSteps.coerceAtLeast(1)

        for (step in 1..limit) {
            if (cancelled) break

            val observation = observer()
            val decision = planner.decide(goal, history, observation)
            recorder?.record(
                "agent_step",
                JSONObject()
                    .put("step", step)
                    .put("thought", decision.thought)
                    .put("done", decision.done)
                    .put("action", decision.action?.description ?: ""),
            )

            if (decision.done || decision.action == null) {
                history += AgentStepResult(step, decision, actionResult = null, verification = null)
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
            history += AgentStepResult(step, decision, actionResult, verification)
        }

        recorder?.record("agent_run_complete", JSONObject().put("steps", history.size))
        return history
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
    }
}
