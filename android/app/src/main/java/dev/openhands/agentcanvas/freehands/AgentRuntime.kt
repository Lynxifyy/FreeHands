package dev.openhands.agentcanvas.freehands

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Snapshot of the agent stack shown in the UI and the overlay. */
data class AgentRuntimeState(
    val serviceRunning: Boolean = false,
    val feedRunning: Boolean = false,
    val nativeBridgeAvailable: Boolean = false,
    val captureRunning: Boolean = false,
    val accessibilityConnected: Boolean = false,
    val agentRunning: Boolean = false,
    val connectedViewers: Int = 0,
    val tier: QualityTier = QualityTier.HIGH,
    val latency: LatencySnapshot = LatencySnapshot(LatencyBudget.DEFAULT_BUDGET_MS, List(5) { 0L }, 0),
    val permissionTier: PermissionTier = PermissionTier.READ_ONLY,
    val currentPlan: String = "",
    val lastError: String = "",
    val framesBroadcast: Long = 0,
    val framesDropped: Long = 0,
)

/**
 * Process-wide observable state of the agent stack.
 *
 * The foreground service owns the components and publishes here; the activity,
 * overlay and health endpoint read from here. A single state holder keeps the
 * UI from having to bind to the service, and means the Compose layer has one
 * source of truth for both the live feed and the agent status.
 */
object AgentRuntime {

    private val mutableState = MutableStateFlow(AgentRuntimeState())

    val state: StateFlow<AgentRuntimeState> = mutableState.asStateFlow()

    fun update(transform: (AgentRuntimeState) -> AgentRuntimeState) {
        mutableState.update(transform)
    }

    fun reset() {
        mutableState.value = AgentRuntimeState()
    }
}
