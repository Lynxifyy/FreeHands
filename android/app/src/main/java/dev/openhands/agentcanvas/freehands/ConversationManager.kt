package dev.openhands.agentcanvas.freehands

/**
 * Bounded history for one agent run.
 *
 * A planner prompt grows with every step, and an unbounded history eventually
 * overflows the model's context window: the request is rejected, or worse, the
 * oldest instructions are silently dropped by the provider and the agent loses
 * the goal. This keeps the history inside two limits at once — a step count and
 * a token budget — dropping the oldest steps first.
 *
 * The newest step is always kept, even when it alone exceeds the token budget.
 * A history that cannot describe the current state is worse than an oversized
 * prompt, so the loop would rather send one large prompt than none.
 *
 * Not thread-safe: the agent loop owns one instance and appends from its own
 * thread, so no lock is needed.
 */
class ConversationManager(
    private val maxTokens: Int = DEFAULT_MAX_TOKENS,
    private val maxSteps: Int = DEFAULT_MAX_STEPS,
) {

    private val steps = ArrayDeque<AgentStepResult>()

    /** The retained steps, oldest first. A copy: callers cannot mutate it. */
    fun history(): List<AgentStepResult> = steps.toList()

    /** Appends [result] and trims the history back inside its budgets. */
    fun append(result: AgentStepResult) {
        steps.addLast(result)
        while (steps.size > maxSteps.coerceAtLeast(1)) {
            steps.removeFirst()
        }
        while (steps.size > 1 && tokens() > maxTokens) {
            steps.removeFirst()
        }
    }

    /** Estimated tokens held by the retained steps. */
    fun tokens(): Int = steps.sumOf { estimateTokens(it) }

    fun clear() = steps.clear()

    companion object {
        /** Roughly a quarter of a 8k window, leaving room for the prompt. */
        const val DEFAULT_MAX_TOKENS = 2048

        const val DEFAULT_MAX_STEPS = 40

        /** Estimated cost of keeping one step in the history. */
        fun estimateTokens(result: AgentStepResult): Int {
            val action = result.decision.action?.description.orEmpty()
            return AgentMetrics.estimateTokens(result.decision.thought + action)
        }
    }
}
