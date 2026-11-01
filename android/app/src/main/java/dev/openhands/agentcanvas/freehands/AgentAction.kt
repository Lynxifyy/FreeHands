package dev.openhands.agentcanvas.freehands

/** An action the agent wants to perform on the device. */
sealed interface AgentAction {
    /** Human-readable description used in the overlay, audit log and UI. */
    val description: String

    /** Taps the centre of a screen coordinate. */
    data class Tap(val x: Int, val y: Int) : AgentAction {
        override val description: String get() = "Tap ($x, $y)"
    }

    /** Taps the centre of a UI node's bounds. */
    data class TapNode(val nodeId: String, val label: String?, val bounds: NodeBounds) : AgentAction {
        override val description: String
            get() = "Tap ${label?.let { "\"$it\"" } ?: nodeId} at (${bounds.centerX}, ${bounds.centerY})"
    }

    /** Swipes between two points over [durationMs]. */
    data class Swipe(
        val fromX: Int,
        val fromY: Int,
        val toX: Int,
        val toY: Int,
        val durationMs: Long = DEFAULT_SWIPE_MS,
    ) : AgentAction {
        override val description: String get() = "Swipe ($fromX, $fromY) -> ($toX, $toY) in ${durationMs}ms"

        companion object {
            const val DEFAULT_SWIPE_MS = 300L
        }
    }

    /** Types [text] into the currently focused field. */
    data class TypeText(val text: String) : AgentAction {
        override val description: String get() = "Type \"$text\""
    }

    /** Presses the system back button. */
    data object Back : AgentAction {
        override val description: String get() = "Back"
    }

    /** Presses the system home button. */
    data object Home : AgentAction {
        override val description: String get() = "Home"
    }

    /** Scrolls a node in [direction] by roughly one viewport. */
    data class Scroll(val nodeId: String, val direction: ScrollDirection) : AgentAction {
        override val description: String get() = "Scroll $direction on $nodeId"
    }

    /** Waits [durationMs] before the next action. */
    data class Wait(val durationMs: Long) : AgentAction {
        override val description: String get() = "Wait ${durationMs}ms"
    }

    /** Long-presses a screen coordinate. */
    data class LongPress(val x: Int, val y: Int, val durationMs: Long = DEFAULT_LONG_PRESS_MS) :
        AgentAction {
        override val description: String get() = "Long press ($x, $y) for ${durationMs}ms"

        companion object {
            const val DEFAULT_LONG_PRESS_MS = 600L
        }
    }
}

enum class ScrollDirection { FORWARD, BACKWARD, UP, DOWN, LEFT, RIGHT }

/** Result of dispatching an action. */
sealed interface ActionResult {
    data object Success : ActionResult

    /** The action was refused by the permission matrix. */
    data class Denied(val reason: String) : ActionResult

    /** The action could not be performed (missing service, bad target). */
    data class Failed(val reason: String) : ActionResult
}

/** Outcome of the permission check for one action. */
sealed interface PermissionDecision {
    data object Allowed : PermissionDecision

    /** Needs a confirmation prompt before it may run. */
    data object RequiresConfirmation : PermissionDecision

    data class Denied(val reason: String) : PermissionDecision
}

/**
 * Tiered permission system for agent actions.
 *
 * Three tiers, each a strict superset of the previous one:
 * - [READ_ONLY] lets the agent observe (screenshots, accessibility reads) but
 *   never change the device.
 * - [ASSISTED] additionally performs "safe" navigation actions (tap, scroll,
 *   back, wait) that cannot destroy data.
 * - [FULL_AUTO] additionally performs actions with irreversible consequences:
 *   typing text into fields, long-press, home, and any package installation or
 *   uninstall.
 *
 * Irreversible actions are never silently allowed in [ASSISTED]: they require
 * an explicit confirmation, which the UI surfaces. In [READ_ONLY] they are
 * denied outright.
 */
enum class PermissionTier(val level: Int) {
    READ_ONLY(0),
    ASSISTED(1),
    FULL_AUTO(2);

    fun atLeast(other: PermissionTier): Boolean = level >= other.level
}

/** Classifies actions so the matrix stays a small, auditable table. */
object PermissionMatrix {

    /**
     * Actions that change device state but are trivially recoverable.
     *
     * Exhaustive over [AgentAction] on purpose: adding a new action type is a
     * compile error until it is classified here, so a new capability cannot
     * silently inherit "allowed".
     */
    fun classify(action: AgentAction): ActionClass = when (action) {
        is AgentAction.Tap,
        is AgentAction.TapNode,
        is AgentAction.Swipe,
        is AgentAction.Scroll,
        is AgentAction.Back,
        is AgentAction.Wait,
        -> ActionClass.SAFE

        is AgentAction.TypeText,
        is AgentAction.LongPress,
        is AgentAction.Home,
        -> ActionClass.IRREVERSIBLE
    }

    fun isSafe(action: AgentAction): Boolean = classify(action) == ActionClass.SAFE

    fun isIrreversible(action: AgentAction): Boolean = classify(action) == ActionClass.IRREVERSIBLE

    /**
     * Decides whether [action] may run at [tier].
     *
     * Read-only denies everything that changes the device. Assisted allows
     * recoverable navigation outright and asks before anything irreversible.
     * Full-auto allows everything.
     */
    fun decide(tier: PermissionTier, action: AgentAction): PermissionDecision {
        return when (tier) {
            PermissionTier.READ_ONLY ->
                PermissionDecision.Denied("Read-only mode does not allow ${action.description}")

            PermissionTier.ASSISTED -> when (classify(action)) {
                ActionClass.SAFE -> PermissionDecision.Allowed
                ActionClass.IRREVERSIBLE -> PermissionDecision.RequiresConfirmation
            }

            PermissionTier.FULL_AUTO -> PermissionDecision.Allowed
        }
    }
}

/** How much trust an action needs. */
enum class ActionClass { SAFE, IRREVERSIBLE }
