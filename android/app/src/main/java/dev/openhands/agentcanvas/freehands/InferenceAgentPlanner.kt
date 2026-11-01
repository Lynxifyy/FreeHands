package dev.openhands.agentcanvas.freehands

import org.json.JSONObject

/**
 * Planner that asks an LLM, on-device or in the cloud, for the next action.
 *
 * The model is shown the accessibility tree, a compact visual fingerprint and a
 * short history of recent steps, then asked for one JSON decision. The history
 * is what lets the model notice that its last action changed nothing and try
 * something else instead of repeating it.
 *
 * Robustness: a model that answers with prose or malformed JSON must not crash
 * the loop. A decision that fails to parse becomes a no-op step with the parse
 * error recorded, and the loop's step budget bounds the damage. The prompt asks
 * for JSON first, but the parser is what enforces it.
 */
class InferenceAgentPlanner(
    private val inference: LocalInferenceService,
    private val recorder: SessionRecorder? = null,
    private val historyLimit: Int = DEFAULT_HISTORY_LIMIT,
) : AgentPlanner {

    override fun decide(
        goal: String,
        history: List<AgentStepResult>,
        observation: AgentObservation,
    ): AgentDecision {
        val prompt = buildPrompt(goal, history, observation)
        val result = try {
            inference.generate(prompt)
        } catch (error: InferenceUnavailableException) {
            recorder?.record("planner_unavailable", JSONObject().put("message", error.message.orEmpty()))
            return AgentDecision(thought = "no inference route available", action = null, done = true)
        }
        recorder?.record(
            "planner_response",
            JSONObject()
                .put("route", result.route.name)
                .put("latencyMs", result.latencyMs)
                .put("model", result.model),
        )
        return try {
            AgentDecisionCodec.decodeDecision(extractJson(result.text))
        } catch (error: AgentProtocolException) {
            recorder?.record("planner_malformed", JSONObject().put("message", error.message.orEmpty()))
            AgentDecision(thought = "the model returned an unparseable decision", action = null, done = false)
        }
    }

    /** Builds the instruction and context handed to the model. */
    fun buildPrompt(
        goal: String,
        history: List<AgentStepResult>,
        observation: AgentObservation,
    ): String {
        val builder = StringBuilder()
        builder.append(INSTRUCTIONS).append('\n')
        builder.append("Goal: ").append(goal).append('\n')
        if (history.isNotEmpty()) {
            builder.append("Recent steps:\n")
            history.takeLast(historyLimit).forEach { step ->
                builder.append("  ")
                    .append(step.step)
                    .append(". ")
                    .append(step.decision.thought)
                    .append(" -> ")
                    .append(describe(step))
                    .append('\n')
            }
        }
        builder.append("Current screen:\n")
        builder.append(AgentDecisionCodec.encodeObservation(observation).toString(2))
        builder.append('\n').append("Decision:")
        return builder.toString()
    }

    private fun describe(step: AgentStepResult): String {
        val action = step.actionResult?.let { it::class.simpleName } ?: "no action"
        val verification = step.verification?.outcome?.name ?: "unverified"
        return "$action ($verification)"
    }

    /**
     * Returns the first JSON object in [text]. Models often wrap the decision in
     * prose or a fenced block even when asked not to, so the braces are located
     * rather than assuming the whole reply is JSON.
     */
    fun extractJson(text: String): String {
        val start = text.indexOf('{')
        if (start < 0) return text.trim()
        var depth = 0
        var inString = false
        var escaped = false
        for (index in start until text.length) {
            val character = text[index]
            when {
                escaped -> escaped = false
                character == '\\' && inString -> escaped = true
                character == '"' -> inString = !inString
                inString -> Unit
                character == '{' -> depth++
                character == '}' -> {
                    depth--
                    if (depth == 0) {
                        return text.substring(start, index + 1)
                    }
                }
            }
        }
        return text.substring(start).trim()
    }

    companion object {
        const val DEFAULT_HISTORY_LIMIT = 6

        /** The wire contract the model must satisfy. */
        val INSTRUCTIONS = """
            You control an Android device through an accessibility service.
            Reply with exactly one JSON object and nothing else:
            {"thought": "<short reason>", "done": <bool>, "action": <action or null>}
            Actions are one of:
              {"type":"tap","x":<int>,"y":<int>}
              {"type":"tap_node","nodeId":"<id>","bounds":{"left":<int>,"top":<int>,"right":<int>,"bottom":<int>}}
              {"type":"swipe","fromX":<int>,"fromY":<int>,"toX":<int>,"toY":<int>,"durationMs":<int>}
              {"type":"type_text","text":"<text>"}
              {"type":"scroll","nodeId":"<id>","direction":"forward|backward"}
              {"type":"back"} {"type":"home"}
              {"type":"wait","durationMs":<int>}
              {"type":"long_press","x":<int>,"y":<int>,"durationMs":<int>}
            Prefer tap_node over tap so the action follows the UI if it moves.
            Set "done": true with "action": null when the goal is complete.
            The "visual" field is a coarse brightness map: "." is dark and "@" is bright.
            Use it to tell whether the screen changed since the last step.
        """.trimIndent()
    }
}
