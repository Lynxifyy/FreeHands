package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentBridgeTest {

    private fun observation(): AgentObservation = AgentObservation(
        timestampMs = 0,
        sequence = 0,
        screenWidth = 1080,
        screenHeight = 1920,
        focusedPackage = "com.example",
        nodes = emptyList(),
    )

    private class Planner(private val decisions: List<AgentDecision>) : AgentPlanner {
        var calls = 0
            private set

        override fun decide(
            goal: String,
            history: List<AgentStepResult>,
            observation: AgentObservation,
        ): AgentDecision = decisions[minOf(calls++, decisions.size - 1)]
    }

    @Test
    fun `runs one step per decision until done`() {
        val planner = Planner(
            listOf(
                AgentDecision("tap it", AgentAction.Tap(1, 1)),
                AgentDecision("type", AgentAction.TypeText("hi")),
                AgentDecision("finished", action = null, done = true),
            ),
        )
        val executed = mutableListOf<AgentAction>()
        val dispatcher = ActionDispatcher(
            executor = ActionExecutor { action ->
                executed += action
                ActionResult.Success
            },
        )
        val bridge = AgentBridge(planner, dispatcher, observer = ::observation)

        val history = bridge.run("do the thing")

        assertEquals(3, history.size)
        assertEquals(2, executed.size)
        assertTrue(history.last().decision.done)
    }

    @Test
    fun `stops at the step limit`() {
        val dispatcher = ActionDispatcher(executor = ActionExecutor { ActionResult.Success })
        val bridge = AgentBridge(
            planner = { _, _, _ -> AgentDecision("keep going", AgentAction.Tap(1, 1)) },
            dispatcher = dispatcher,
            observer = ::observation,
        )

        val history = bridge.run("never finishes", maxSteps = 4)

        assertEquals(4, history.size)
    }

    @Test
    fun `verifies a successful action`() {
        val source = LatestFrameSource()
        source.publish(LumaFrame.uniform(16, 16, 0))
        var ticks = 0L
        val verifier = ActionVerifier(
            frameSource = source,
            sleep = { ticks += 50 },
            clock = { ticks },
            pollIntervalMs = 50,
            waitWindowMs = 100,
        )
        val dispatcher = ActionDispatcher(
            executor = ActionExecutor {
                source.publish(LumaFrame.uniform(16, 16, 255))
                ActionResult.Success
            },
        )
        val planner = Planner(
            listOf(
                AgentDecision("tap", AgentAction.Tap(1, 1)),
                AgentDecision("done", null, done = true),
            ),
        )
        val bridge = AgentBridge(planner, dispatcher, observer = ::observation, verifier = verifier)

        val history = bridge.run("tap and check")

        assertEquals(VerificationOutcome.VERIFIED, history.first().verification?.outcome)
    }

    @Test
    fun `does not verify a denied action`() {
        val dispatcher = ActionDispatcher(
            executor = ActionExecutor { ActionResult.Success },
            permissionProvider = { PermissionTier.READ_ONLY },
        )
        val planner = Planner(
            listOf(
                AgentDecision("tap", AgentAction.Tap(1, 1)),
                AgentDecision("done", null, done = true),
            ),
        )
        val bridge = AgentBridge(
            planner,
            dispatcher,
            observer = ::observation,
            verifier = ActionVerifier(LatestFrameSource()),
        )

        val history = bridge.run("tap")

        assertEquals(ActionResult.Denied("Read-only mode does not allow Tap (1, 1)"), history.first().actionResult)
        assertNull(history.first().verification)
    }

    @Test
    fun `cancel stops the loop before the next step`() {
        val dispatcher = ActionDispatcher(executor = ActionExecutor { ActionResult.Success })
        lateinit var bridge: AgentBridge
        val planner = AgentPlanner { _, _, _ ->
            bridge.cancel()
            AgentDecision("tap", AgentAction.Tap(1, 1))
        }
        bridge = AgentBridge(planner, dispatcher, observer = ::observation)

        val history = bridge.run("cancel me", maxSteps = 10)

        assertTrue(history.size <= 2)
    }

    @Test
    fun `records each step and the run completion`() {
        val dir = java.nio.file.Files.createTempDirectory("freehands-bridge").toFile()
        val recorder = SessionRecorder(dir, clock = { 1L }, sessionId = "bridge")
        val dispatcher = ActionDispatcher(executor = ActionExecutor { ActionResult.Success })
        val planner = Planner(listOf(AgentDecision("tap", AgentAction.Tap(1, 1)), AgentDecision("done", null, true)))
        val bridge = AgentBridge(planner, dispatcher, observer = ::observation, recorder = recorder)

        bridge.run("go")

        val types = recorder.readAll().map { it.type }
        assertTrue(types.contains("agent_step"))
        assertTrue(types.contains("agent_run_complete"))
    }

    @Test
    fun `reports the planner telemetry in the run rollup`() {
        val dir = java.nio.file.Files.createTempDirectory("freehands-bridge-metrics").toFile()
        val recorder = SessionRecorder(dir, clock = { 1L }, sessionId = "bridge-metrics")
        val dispatcher = ActionDispatcher(executor = ActionExecutor { ActionResult.Success })
        val planner = object : AgentPlanner {
            override fun decide(
                goal: String,
                history: List<AgentStepResult>,
                observation: AgentObservation,
            ): AgentDecision = AgentDecision("tap", AgentAction.Tap(1, 1))

            override fun lastTelemetry(): PlannerTelemetry =
                PlannerTelemetry(promptTokens = 40, completionTokens = 8, latencyMs = 25, route = InferenceRoute.CLOUD)
        }
        val bridge = AgentBridge(planner, dispatcher, observer = ::observation, recorder = recorder)

        bridge.run("go", maxSteps = 1)

        val completion = recorder.readAll().last { it.type == "agent_run_complete" }
        val metrics = completion.detail.getJSONObject("metrics")
        assertEquals(1, metrics.getInt("steps"))
        assertEquals(48, metrics.getInt("totalTokens"))
        assertEquals(25L, metrics.getLong("totalLatencyMs"))
        assertEquals(1, metrics.getJSONObject("perRoute").getInt("CLOUD"))
    }

    @Test
    fun `honours the constructor step limit when the call site uses the default`() {
        val dispatcher = ActionDispatcher(executor = ActionExecutor { ActionResult.Success })
        val bridge = AgentBridge(
            planner = { _, _, _ -> AgentDecision("keep going", AgentAction.Tap(1, 1)) },
            dispatcher = dispatcher,
            observer = ::observation,
            maxSteps = 3,
        )

        val history = bridge.run("bounded")

        assertEquals(3, history.size)
    }

    @Test
    fun `bounds the history handed to the planner but returns every step`() {
        val seen = mutableListOf<Int>()
        val dispatcher = ActionDispatcher(executor = ActionExecutor { ActionResult.Success })
        val bridge = AgentBridge(
            planner = { _, history, _ ->
                seen += history.size
                AgentDecision("keep going", AgentAction.Tap(1, 1))
            },
            dispatcher = dispatcher,
            observer = ::observation,
            conversation = ConversationManager(maxTokens = 100_000, maxSteps = 2),
        )

        val results = bridge.run("long run", maxSteps = 6)

        assertEquals(6, results.size)
        assertEquals(listOf(0, 1, 2, 2, 2, 2), seen)
    }

    @Test
    fun `missing accessibility service stops the loop instead of repeated failures`() {
        var calls = 0
        val dispatcher = ActionDispatcher(executor = { ActionResult.Failed("accessibility disabled") })
        val bridge = AgentBridge(planner = { _, _, _ -> calls++; AgentDecision("tap", AgentAction.Tap(1, 1)) }, dispatcher = dispatcher, observer = ::observation)
        assertEquals(1, bridge.run("goal").size)
        assertEquals(1, calls)
        assertFalse(dispatcher.isRunning)
    }

    @Test
    fun `a failed goal leaves a shared service dispatcher available`() {
        val dispatcher = ActionDispatcher(executor = { ActionResult.Failed("accessibility disabled") })
        dispatcher.start()
        val bridge = AgentBridge(
            planner = { _, _, _ -> AgentDecision("tap", AgentAction.Tap(1, 1)) },
            dispatcher = dispatcher,
            observer = ::observation,
            ownsDispatcher = false,
        )

        assertEquals(1, bridge.run("goal").size)
        assertTrue(dispatcher.isRunning)
        var completed = false
        assertTrue(dispatcher.submit(AgentAction.Tap(2, 2)) { _, _ -> completed = true })
        assertTrue(dispatcher.awaitIdle(1000))
        assertTrue(completed)
        dispatcher.close()
    }

    @Test
    fun `repeated malformed no-op decisions stop promptly`() {
        val dispatcher = ActionDispatcher(executor = { ActionResult.Success })
        val bridge = AgentBridge(planner = { _, _, _ -> AgentDecision("invalid response", null, false) }, dispatcher = dispatcher, observer = ::observation)
        assertEquals(3, bridge.run("goal").size)
        dispatcher.close()
    }

    @Test
    fun `done without telemetry is a successful step`() {
        val dispatcher = ActionDispatcher(executor = { ActionResult.Success })
        val metrics = AgentMetrics()
        val bridge = AgentBridge({ _, _, _ -> AgentDecision("finished", null, done = true) }, dispatcher, ::observation, metrics = metrics)
        bridge.run("finish")
        assertEquals(1, metrics.snapshot().successes)
    }
}
