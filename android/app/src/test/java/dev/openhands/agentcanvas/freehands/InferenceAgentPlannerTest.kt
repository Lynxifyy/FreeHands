package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InferenceAgentPlannerTest {

    private class StubLocal(
        private val reply: String? = null,
        private val fail: Boolean = false,
        override val modelName: String = "stub-local",
    ) : LocalInference {
        override fun generate(prompt: String, maxTokens: Int): String {
            if (fail) throw IllegalStateException("local model failed")
            return reply ?: ""
        }
    }

    private val observation = AgentObservation(
        timestampMs = 1,
        sequence = 1,
        screenWidth = 1080,
        screenHeight = 1920,
        focusedPackage = "com.example",
        nodes = emptyList(),
    )

    /** A local route that reports measured token counts, like the native engine. */
    private class MeasuringLocal(
        private val reply: String,
        private val promptTokens: Long,
        private val completionTokens: Long,
        override val modelName: String = "stub-local",
    ) : LocalInference, InferenceTelemetrySource {
        override fun generate(prompt: String, maxTokens: Int): String = reply
        override fun lastTokenCounts(): Pair<Long, Long> = promptTokens to completionTokens
    }

    private fun planner(reply: String, recorder: SessionRecorder? = null) = InferenceAgentPlanner(
        inference = LocalInferenceService(
            local = StubLocal(reply = reply),
            cloud = null,
            connectivity = { false },
        ),
        recorder = recorder,
    )

    private fun measuringPlanner(reply: String, promptTokens: Long, completionTokens: Long) =
        InferenceAgentPlanner(
            inference = LocalInferenceService(
                local = MeasuringLocal(reply, promptTokens, completionTokens),
                cloud = null,
                connectivity = { false },
            ),
        )

    @Test
    fun `decodes a well formed decision`() {
        val decision = planner("""{"thought":"tap it","action":{"type":"tap","x":10,"y":20}}""")
            .decide("goal", emptyList(), observation)

        assertEquals("tap it", decision.thought)
        assertEquals(AgentAction.Tap(10, 20), decision.action)
    }

    @Test
    fun `accepts a decision wrapped in prose`() {
        val reply = "Sure! Here is my decision:\n{\"thought\":\"done\",\"done\":true,\"action\":null}"

        val decision = planner(reply).decide("goal", emptyList(), observation)

        assertTrue(decision.done)
    }

    @Test
    fun `a malformed reply becomes a safe no-op step`() {
        val decision = planner("I cannot help with that.").decide("goal", emptyList(), observation)

        assertEquals(null, decision.action)
        assertEquals(false, decision.done)
        assertTrue(decision.thought.isNotBlank())
    }

    @Test
    fun `no inference route reports a failure instead of claiming success`() {
        val service = LocalInferenceService(local = null, cloud = null, connectivity = { false })

        try {
            InferenceAgentPlanner(service).decide("goal", emptyList(), observation)
            org.junit.Assert.fail("Expected an unavailable planner failure")
        } catch (error: AgentPlannerException) {
            assertTrue(error.message!!.contains("No inference model"))
        }
    }

    @Test
    fun `prompt includes the goal, the tree and the visual digest`() {
        val tree = UiNode(
            id = "button",
            className = "android.widget.Button",
            text = "Continue",
            contentDescription = null,
            clickable = true,
            scrollable = false,
            editable = false,
            enabled = true,
            focused = false,
            bounds = NodeBounds(0, 0, 10, 10),
            depth = 0,
        )
        val withTree = observation.copy(nodes = tree.flatten())
        val withFrame = withTree.copy(
            visualDigest = "@@@@".toByteArray(Charsets.US_ASCII),
        )

        val prompt = planner("""{"thought":"x","done":true}""").buildPrompt("buy milk", emptyList(), withFrame)

        assertTrue(prompt.contains("buy milk"))
        assertTrue(prompt.contains("Continue"))
        assertTrue(prompt.contains("@@@"))
    }

    @Test
    fun `prompt summarises the recent history`() {
        val history = listOf(
            AgentStepResult(
                step = 1,
                decision = AgentDecision("try tapping", AgentAction.Back),
                actionResult = ActionResult.Success,
                verification = VerificationResult(VerificationOutcome.UNCHANGED, 100, null),
            ),
        )

        val prompt = planner("""{"thought":"x","done":true}""")
            .buildPrompt("goal", history, observation)

        assertTrue(prompt.contains("try tapping"))
        assertTrue(prompt.contains("UNCHANGED"))
    }

    @Test
    fun `extracts the first complete json object`() {
        val planner = planner("""{"thought":"x","done":true}""")

        assertEquals(
            """{"a":1}""",
            planner.extractJson("noise {\"a\":1} trailing {ignored"),
        )
        assertEquals(
            """{"text":"a}b"}""",
            planner.extractJson("prefix {\"text\":\"a}b\"} suffix"),
        )
    }

    @Test
    fun `reports the telemetry of the model call`() {
        val planner = planner("""{"thought":"x","done":true}""")

        planner.decide("goal", emptyList(), observation)

        val telemetry = planner.lastTelemetry()
        assertTrue(telemetry != null)
        assertEquals(InferenceRoute.LOCAL, telemetry!!.route)
        assertTrue(telemetry.promptTokens > 0)
        assertTrue(telemetry.completionTokens > 0)
    }

    @Test
    fun `uses the token counts the engine measured`() {
        val planner = measuringPlanner("""{"thought":"x","done":true}""", 120L, 9L)

        planner.decide("goal", emptyList(), observation)

        val telemetry = planner.lastTelemetry()
        assertTrue(telemetry != null)
        assertEquals(120, telemetry!!.promptTokens)
        assertEquals(9, telemetry.completionTokens)
    }

    @Test
    fun `estimates the tokens when the route cannot measure them`() {
        val planner = planner("""{"thought":"x","done":true}""")

        planner.decide("goal", emptyList(), observation)

        val telemetry = planner.lastTelemetry()
        assertTrue(telemetry != null)
        assertTrue(telemetry!!.promptTokens > 0)
    }

    @Test
    fun `reports no telemetry when no route could serve the request`() {
        val service = LocalInferenceService(local = null, cloud = null, connectivity = { false })
        val planner = InferenceAgentPlanner(service)

        try {
            planner.decide("goal", emptyList(), observation)
            org.junit.Assert.fail("Expected an unavailable planner failure")
        } catch (_: AgentPlannerException) {
            assertEquals(null, planner.lastTelemetry())
        }
    }
}
