package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationManagerTest {

    private fun step(index: Int, thought: String = "t", action: AgentAction? = null) = AgentStepResult(
        step = index,
        decision = AgentDecision(thought, action),
        actionResult = null,
        verification = null,
    )

    @Test
    fun `keeps steps in order`() {
        val manager = ConversationManager()

        manager.append(step(1))
        manager.append(step(2))
        manager.append(step(3))

        assertEquals(listOf(1, 2, 3), manager.history().map { it.step })
    }

    @Test
    fun `drops the oldest step when the step budget is exceeded`() {
        val manager = ConversationManager(maxSteps = 3)

        (1..5).forEach { manager.append(step(it)) }

        assertEquals(listOf(3, 4, 5), manager.history().map { it.step })
    }

    @Test
    fun `drops the oldest steps until the token budget fits`() {
        // "twelve chars" is 12 characters, so a step costs 3 estimated tokens.
        val manager = ConversationManager(maxTokens = 8, maxSteps = 100)

        (1..5).forEach { manager.append(step(it, thought = "twelve chars")) }

        assertEquals(2, manager.history().size)
        assertEquals(6, manager.tokens())
        assertEquals(5, manager.history().last().step)
    }

    @Test
    fun `keeps at least the newest step even when it alone exceeds the budget`() {
        val manager = ConversationManager(maxTokens = 1, maxSteps = 100)

        manager.append(step(1, thought = "a very long thought that cannot possibly fit in one token"))

        assertEquals(1, manager.history().size)
        assertEquals(1, manager.history().first().step)
    }

    @Test
    fun `reports the token total for the retained steps`() {
        val manager = ConversationManager(maxTokens = 1000, maxSteps = 10)

        // 8 characters each, so 2 estimated tokens per step.
        manager.append(step(1, thought = "abcdefgh"))
        manager.append(step(2, thought = "abcdefgh"))

        assertEquals(4, manager.tokens())
    }

    @Test
    fun `clear empties the history`() {
        val manager = ConversationManager()
        manager.append(step(1))

        manager.clear()

        assertEquals(0, manager.history().size)
        assertEquals(0, manager.tokens())
    }

    @Test
    fun `estimates the cost of a step from its thought and action`() {
        val withAction = step(1, thought = "abcd", action = AgentAction.Back)

        assertTrue(ConversationManager.estimateTokens(withAction) > 1)
        assertTrue(
            ConversationManager.estimateTokens(withAction) >
                ConversationManager.estimateTokens(step(2, thought = "abcd")),
        )
    }

    @Test
    fun `history is a snapshot that callers cannot mutate`() {
        val manager = ConversationManager()
        manager.append(step(1))

        val history = manager.history()
        manager.append(step(2))

        assertEquals(1, history.size)
        assertEquals(2, manager.history().size)
    }
}
