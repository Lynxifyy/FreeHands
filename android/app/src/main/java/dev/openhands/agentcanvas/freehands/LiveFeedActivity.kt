package dev.openhands.agentcanvas.freehands

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.openhands.agentcanvas.R

/**
 * Live view of the device screen plus the agent status and controls.
 *
 * The decoded stream renders through a [SurfaceView] so frames go straight from
 * the codec to the display without a copy through the Compose render tree,
 * which is what keeps the feed inside its latency budget.
 *
 * The screen is shown alongside the numbers that matter for tuning: the
 * per-stage latency against the budget, the active quality tier, and whether
 * each prerequisite (native bridge, accessibility, notification permission) is
 * in place. Failures are shown inline with a fix action rather than as a crash.
 */
class LiveFeedActivity : ComponentActivity() {

    private var decoder: VideoDecoder? = null
    private var pendingGoal: String? = null

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            AgentRuntime.update { it.copy(lastError = if (granted) "" else getString(R.string.freehands_error_notifications_denied)) }
        }

    /**
     * Asks the user to allow screen capture, then starts the service. Capture is
     * the only way the feed gets pixels, so the request happens before the
     * service starts rather than the service failing later with no explanation.
     */
    private val captureConsentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode == RESULT_OK && data != null) {
                CaptureConsent.grant(result.resultCode, data)
                val goal = pendingGoal
                pendingGoal = null
                if (goal == null) AgentExecutionService.start(this)
                else AgentExecutionService.runGoal(this, goal)
            } else {
                pendingGoal = null
                AgentRuntime.update { it.copy(lastError = getString(R.string.freehands_error_capture_denied)) }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    LiveFeedScreen(
                        onStart = { requestCaptureThenStart() },
                        onRunGoal = { goal ->
                            if (AgentRuntime.state.value.serviceRunning) AgentExecutionService.runGoal(this, goal)
                            else requestCaptureThenStart(goal)
                        },
                        onCancelGoal = { AgentExecutionService.cancelGoal(this) },
                        onStop = { AgentExecutionService.stop(this) },
                        onPermissionTierChange = { tier ->
                            AgentRuntime.update { it.copy(permissionTier = tier) }
                        },
                        onOpenAccessibilitySettings = { openAccessibilitySettings() },
                        onSurfaceReady = { surface -> attachDecoder(surface) },
                        onSurfaceDestroyed = { detachDecoder() },
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        detachDecoder()
        super.onDestroy()
    }

    /** Requests capture consent, falling back to a direct start if unavailable. */
    private fun requestCaptureThenStart(goal: String? = null) {
        pendingGoal = goal
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        if (manager == null) {
            // Without a projection service there is nothing to consent to; start
            // anyway so the UI can report the missing capture component.
            if (goal == null) AgentExecutionService.start(this)
            else AgentExecutionService.runGoal(this, goal)
            pendingGoal = null
            return
        }
        captureConsentLauncher.launch(manager.createScreenCaptureIntent())
    }

    private fun attachDecoder(surface: android.view.Surface) {
        detachDecoder()
        decoder = VideoDecoder(surface) { message ->
            AgentRuntime.update { it.copy(lastError = message) }
        }
        AgentExecutionService.attachPreview(decoder)
    }

    private fun detachDecoder() {
        AgentExecutionService.attachPreview(null)
        decoder?.release()
        decoder = null
    }

    private fun openAccessibilitySettings() {
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

@Composable
private fun LiveFeedScreen(
    onStart: () -> Unit,
    onRunGoal: (String) -> Unit,
    onCancelGoal: () -> Unit,
    onStop: () -> Unit,
    onPermissionTierChange: (PermissionTier) -> Unit,
    onOpenAccessibilitySettings: () -> Unit,
    onSurfaceReady: (android.view.Surface) -> Unit,
    onSurfaceDestroyed: () -> Unit,
) {
    val state by AgentRuntime.state.collectAsStateWithLifecycle()
    var goal by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        FeedSurface(onSurfaceReady = onSurfaceReady, onSurfaceDestroyed = onSurfaceDestroyed)

        Card(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(text = stringResource(R.string.freehands_title), style = MaterialTheme.typography.titleMedium)
                StatusRow(stringResource(R.string.freehands_status_service), state.serviceRunning)
                StatusRow(stringResource(R.string.freehands_status_feed), state.feedRunning)
                StatusRow(stringResource(R.string.freehands_status_native_bridge), state.nativeBridgeAvailable)
                StatusRow(stringResource(R.string.freehands_status_capture), state.captureRunning)
                StatusRow(stringResource(R.string.freehands_status_accessibility), state.accessibilityConnected)
                StatusRow(stringResource(R.string.freehands_status_agent), state.agentRunning)
                val viewers = pluralStringResource(
                    R.plurals.freehands_viewer_count,
                    state.connectedViewers,
                    state.connectedViewers,
                )
                Text(
                    text = stringResource(
                        R.string.freehands_latency_summary,
                        state.latency.totalMs,
                        state.latency.budgetMs,
                        state.tier.name.lowercase(),
                        viewers,
                    ),
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    text = stringResource(R.string.freehands_frames_summary, state.framesBroadcast, state.framesDropped),
                )
                if (state.lastError.isNotBlank()) {
                    Text(
                        text = state.lastError,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        PermissionTierSelector(current = state.permissionTier, onChange = onPermissionTierChange)
        OutlinedTextField(
            value = goal,
            onValueChange = { if (it.length <= AgentExecutionService.MAX_GOAL_LENGTH) goal = it },
            label = { Text(stringResource(R.string.freehands_goal_label)) },
            enabled = !state.agentRunning,
            minLines = 2,
            maxLines = 4,
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )
        if (state.currentPlan.isNotBlank()) {
            Text(stringResource(R.string.freehands_current_goal, state.currentPlan), modifier = Modifier.padding(top = 8.dp))
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onRunGoal(goal.trim()) }, enabled = goal.isNotBlank() && !state.agentRunning) {
                Text(stringResource(R.string.freehands_action_run_goal))
            }
            Button(onClick = onCancelGoal, enabled = state.agentRunning) {
                Text(stringResource(R.string.freehands_action_cancel_goal))
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(onClick = onStart, enabled = !state.serviceRunning) {
                Text(stringResource(R.string.freehands_action_start))
            }
            Button(onClick = onStop, enabled = state.serviceRunning) {
                Text(stringResource(R.string.freehands_action_stop))
            }
            if (!state.accessibilityConnected) {
                Button(onClick = onOpenAccessibilitySettings) {
                    Text(stringResource(R.string.freehands_action_enable_accessibility))
                }
            }
        }
    }
}

@Composable
private fun FeedSurface(
    onSurfaceReady: (android.view.Surface) -> Unit,
    onSurfaceDestroyed: () -> Unit,
) {
    AndroidView(
        modifier = Modifier.fillMaxWidth(),
        factory = { context ->
            SurfaceView(context).apply {
                holder.addCallback(object : SurfaceHolder.Callback {
                    override fun surfaceCreated(holder: SurfaceHolder) = onSurfaceReady(holder.surface)

                    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

                    override fun surfaceDestroyed(holder: SurfaceHolder) = onSurfaceDestroyed()
                })
            }
        },
    )
}

@Composable
private fun StatusRow(label: String, ok: Boolean) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(text = label, modifier = Modifier.padding(end = 8.dp))
        Text(text = if (ok) stringResource(R.string.freehands_status_ok) else stringResource(R.string.freehands_status_missing))
    }
}

@Composable
private fun PermissionTierSelector(current: PermissionTier, onChange: (PermissionTier) -> Unit) {
    var selected by remember(current) { mutableStateOf(current) }
    Column(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Text(text = stringResource(R.string.freehands_permission_title), style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            PermissionTier.entries.forEach { tier ->
                Button(onClick = {
                    selected = tier
                    onChange(tier)
                }) {
                    Text(
                        text = if (tier == selected) {
                            stringResource(R.string.freehands_permission_selected, tier.name.lowercase())
                        } else {
                            tier.name.lowercase()
                        },
                    )
                }
            }
        }
    }
}
