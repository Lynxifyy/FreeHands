package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionMatrixTest {

    private val tap = AgentAction.Tap(10, 20)
    private val typing = AgentAction.TypeText("hello")

    @Test
    fun `read only denies navigation actions`() {
        val decision = PermissionMatrix.decide(PermissionTier.READ_ONLY, tap)

        assertTrue(decision is PermissionDecision.Denied)
    }

    @Test
    fun `read only denies typing`() {
        val decision = PermissionMatrix.decide(PermissionTier.READ_ONLY, typing)

        assertTrue(decision is PermissionDecision.Denied)
    }

    @Test
    fun `assisted allows safe navigation`() {
        assertEquals(PermissionDecision.Allowed, PermissionMatrix.decide(PermissionTier.ASSISTED, tap))
        assertEquals(
            PermissionDecision.Allowed,
            PermissionMatrix.decide(PermissionTier.ASSISTED, AgentAction.Swipe(0, 0, 0, 100)),
        )
        assertEquals(
            PermissionDecision.Allowed,
            PermissionMatrix.decide(PermissionTier.ASSISTED, AgentAction.Back),
        )
    }

    @Test
    fun `assisted asks for confirmation before typing`() {
        assertEquals(
            PermissionDecision.RequiresConfirmation,
            PermissionMatrix.decide(PermissionTier.ASSISTED, typing),
        )
    }

    @Test
    fun `full auto allows everything known`() {
        assertEquals(
            PermissionDecision.Allowed,
            PermissionMatrix.decide(PermissionTier.FULL_AUTO, typing),
        )
        assertEquals(
            PermissionDecision.Allowed,
            PermissionMatrix.decide(PermissionTier.FULL_AUTO, AgentAction.Home),
        )
    }

    /** Every action the protocol can produce must be classified. */
    private val everyAction: List<AgentAction> = listOf(
        AgentAction.Tap(0, 0),
        AgentAction.TapNode("n", null, NodeBounds(0, 0, 1, 1)),
        AgentAction.Swipe(0, 0, 1, 1),
        AgentAction.TypeText("x"),
        AgentAction.Back,
        AgentAction.Home,
        AgentAction.Scroll("n", ScrollDirection.DOWN),
        AgentAction.Wait(1),
        AgentAction.LongPress(0, 0),
    )

    @Test
    fun `classifies every action type`() {
        everyAction.forEach { action ->
            val classification = PermissionMatrix.classify(action)
            assertTrue(
                "unclassified action ${action.description}",
                classification == ActionClass.SAFE || classification == ActionClass.IRREVERSIBLE,
            )
        }
    }

    @Test
    fun `classifies known actions`() {
        assertTrue(PermissionMatrix.isSafe(tap))
        assertTrue(PermissionMatrix.isIrreversible(typing))
        assertTrue(PermissionMatrix.isIrreversible(AgentAction.LongPress(1, 1)))
    }

    @Test
    fun `tier ordering is monotonic`() {
        assertTrue(PermissionTier.FULL_AUTO.atLeast(PermissionTier.ASSISTED))
        assertTrue(PermissionTier.ASSISTED.atLeast(PermissionTier.READ_ONLY))
        assertTrue(!PermissionTier.READ_ONLY.atLeast(PermissionTier.ASSISTED))
    }
}
