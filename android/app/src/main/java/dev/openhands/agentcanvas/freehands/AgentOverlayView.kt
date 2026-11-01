package dev.openhands.agentcanvas.freehands

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import dev.openhands.agentcanvas.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Floating overlay showing the agent's current plan and status.
 *
 * The overlay is built in code rather than from a layout so it has no
 * dependency on the host activity's theme: it is drawn over other apps, where
 * no theme is available. It reads [AgentRuntime] directly, so the activity and
 * the overlay always agree.
 */
class AgentOverlayView(private val context: Context) {

    private val container = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(OVERLAY_PADDING, OVERLAY_PADDING, OVERLAY_PADDING, OVERLAY_PADDING)
        setBackgroundColor(OVERLAY_BACKGROUND)
    }

    private val planView = TextView(context).apply {
        setTextColor(Color.WHITE)
        textSize = 13f
    }

    private val statusView = TextView(context).apply {
        setTextColor(Color.LTGRAY)
        textSize = 11f
    }

    init {
        container.addView(planView)
        container.addView(statusView)
    }

    val view: View get() = container

    /** Renders [state] into the overlay. */
    fun render(state: AgentRuntimeState) {
        val plan = state.currentPlan.ifBlank { context.getString(R.string.freehands_overlay_idle) }
        planView.text = plan
        val tier = state.tier.name.lowercase()
        val latency = state.latency.totalMs
        val viewers = context.resources.getQuantityString(
            R.plurals.freehands_viewer_count,
            state.connectedViewers,
            state.connectedViewers,
        )
        statusView.text = context.getString(
            R.string.freehands_overlay_status,
            tier,
            latency,
            state.latency.budgetMs,
            viewers,
        )
        container.visibility = if (state.serviceRunning) View.VISIBLE else View.GONE
    }
}

/**
 * Hosts the floating overlay. Kept separate from the agent service so the user
 * can hide the overlay without stopping the agent.
 */
class AgentOverlayService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var windowManager: WindowManager? = null
    private var overlay: AgentOverlayView? = null
    private var renderJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        windowManager = manager
        val view = AgentOverlayView(this)
        overlay = view
        val params = buildLayoutParams()
        try {
            manager.addView(view.view, params)
        } catch (error: Exception) {
            overlay = null
            return
        }
        renderJob = scope.launch {
            AgentRuntime.state.collectLatest { state -> view.render(state) }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        renderJob?.cancel()
        scope.cancel()
        overlay?.let { view ->
            try {
                windowManager?.removeView(view.view)
            } catch (error: Exception) {
                // Already detached.
            }
        }
        overlay = null
        windowManager = null
        super.onDestroy()
    }

    private fun buildLayoutParams(): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = MARGIN
            y = MARGIN
        }
    }

    companion object {
        private const val MARGIN = 24

        fun start(context: Context) {
            context.startService(Intent(context, AgentOverlayService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AgentOverlayService::class.java))
        }
    }
}

private const val OVERLAY_PADDING = 24
private val OVERLAY_BACKGROUND = Color.argb(200, 0, 0, 0)
