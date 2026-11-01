package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
}
