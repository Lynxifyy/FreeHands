package dev.openhands.agentcanvas.freehands

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import dev.openhands.agentcanvas.BuildConfig
import dev.openhands.agentcanvas.R
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/**
 * Foreground service that keeps the agent alive during long tasks.
 *
 * Android suspends background work aggressively, and the live feed must keep
 * running while the user is in another app, so the whole stack lives here
 * behind an ongoing notification. The service owns one of each component
 * (native bridge, screen capture, feed server, dispatcher, recorder) and
 * publishes state to [AgentRuntime] for the UI.
 *
 * The capture path is: [ScreenCaptureSource] encodes the screen, hands each
 * access unit to [CapturePipeline], which pushes it into the native
 * [ScrcpyBridge]; the bridge's capture thread fans frames out to the feed
 * server and publishes luma frames for action verification.
 *
 * The service is explicit about its lifecycle: [onStartCommand] is idempotent so
 * a restart after a crash reuses the running stack, and a stop action is exposed
 * through the notification so the user can always end the session.
 */
class AgentExecutionService : Service() {

    private var bridge: ScrcpyBridge? = null
    private var feedServer: LiveFeedServer? = null
    private var dispatcher: ActionDispatcher? = null
    private var recorder: SessionRecorder? = null
    private var decoder: VideoDecoder? = null
    private var healthServer: HealthCheckServer? = null
    private var capture: ScreenCaptureSource? = null
    private var pipeline: CapturePipeline? = null
    private var latestFrame: LatestFrameSource? = null
    private var verifier: ActionVerifier? = null
    private var observationProvider: AgentObservationProvider? = null
    private var inference: LocalInferenceService? = null
    private var profile: DeviceProfile = DeviceProfileDetector.detect()
    private val healthRegistry = HealthRegistry()
    private val agentRunning = AtomicBoolean(false)

    @Volatile
    private var agentLoop: AgentLoop? = null

    private var started = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopAgent()
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_RUN_GOAL -> {
                val goal = intent.getStringExtra(EXTRA_GOAL)?.trim()
                if (goal.isNullOrBlank() || goal.length > MAX_GOAL_LENGTH) {
                    AgentRuntime.update { it.copy(lastError = getString(R.string.freehands_error_goal)) }
                } else {
                    startAgent()
                    runAgent(goal)
                }
            }
            ACTION_CANCEL_GOAL -> agentLoop?.cancel()

            else -> startAgent()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopAgent()
        if (instance === this) {
            instance = null
        }
        super.onDestroy()
    }

    /** The live dispatcher, or null when the service is not running. */
    fun actionDispatcher(): ActionDispatcher? = dispatcher

    /** The live recorder, or null when the service is not running. */
    fun sessionRecorder(): SessionRecorder? = recorder

    /** The live feed server, or null when the service is not running. */
    fun liveFeedServer(): LiveFeedServer? = feedServer

    /** True while an agent goal is being worked on. */
    val isAgentRunning: Boolean get() = agentRunning.get()

    /** Cancels the running goal, if any. */
    fun cancelAgent() {
        agentLoop?.cancel()
    }

    private fun startAgent() {
        if (started) {
            return
        }
        started = true

        startForeground(NOTIFICATION_ID, buildNotification(getString(R.string.freehands_notification_running)))

        val profile = DeviceProfileDetector.detect()
        val sessionRecorder = SessionRecorder(java.io.File(filesDir, RECORDINGS_DIRECTORY))
        recorder = sessionRecorder

        val tier = profile.suggestedTier()
        val settings = CaptureGeometry.forScreen(
            screenWidth = profile.screenWidth.takeIf { it > 0 } ?: ScrcpyBridge.DEFAULT_WIDTH,
            screenHeight = profile.screenHeight.takeIf { it > 0 } ?: ScrcpyBridge.DEFAULT_HEIGHT,
            tier = tier,
            fps = profile.suggestedFps(),
        )
        val nativeBridge = ScrcpyBridge(
            width = settings.width,
            height = settings.height,
            fps = settings.fps,
            bitrateKbps = settings.bitrateKbps,
            latencyBudgetMs = LatencyBudget.DEFAULT_BUDGET_MS,
        )
        bridge = nativeBridge

        val transport = WebSocketFeedTransport()
        val server = LiveFeedServer(
            transport = transport,
            recorder = sessionRecorder,
        )
        server.setObserver(pendingPreview)
        feedServer = server

        val actionDispatcher = ActionDispatcher(
            executor = { action -> executeOnDevice(action) },
            permissionProvider = { AgentRuntime.state.value.permissionTier },
            recorder = sessionRecorder,
            rateLimiter = RateLimiter(),
        )
        dispatcher = actionDispatcher

        // The frame source feeds both the verifier and the observation builder,
        // so an action is judged against the same screen the planner saw.
        val frameSource = LatestFrameSource()
        latestFrame = frameSource
        verifier = ActionVerifier(frameSource)
        observationProvider = AgentObservationProvider(
            screenWidth = { settings.width },
            screenHeight = { settings.height },
            focusedPackage = { FreeHandsAccessibilityService.current()?.frontPackage().orEmpty() },
        )
        inference = buildInference()

        val capturePipeline = CapturePipeline(
            pusher = nativeBridge.asFramePusher(),
            latestFrame = frameSource,
            recorder = sessionRecorder,
        )
        pipeline = capturePipeline

        nativeBridge.setConsumer(server)
        if (nativeBridge.start()) {
            server.start()
            actionDispatcher.start()
            startCapture(capturePipeline, settings)
            startHealthEndpoint(server, actionDispatcher)
            sessionRecorder.record(
                SessionRecorder.EVENT_SERVICE_START,
                JSONObject()
                    .put("model", profile.model)
                    .put("sdkInt", profile.sdkInt)
                    .put("tier", tier.name)
                    .put("width", settings.width)
                    .put("height", settings.height)
                    .put("bitrateKbps", settings.bitrateKbps),
            )
        } else {
            val message = nativeBridge.lastError().ifBlank { getString(R.string.freehands_error_bridge_unavailable) }
            sessionRecorder.record(SessionRecorder.EVENT_ERROR, JSONObject().put("message", message))
            AgentRuntime.update { it.copy(lastError = message) }
        }

        FreeHandsAccessibilityService.recorder = sessionRecorder
        publishState()
    }

    /**
     * Starts screen capture with the user's consent, recording a reason when
     * capture is unavailable. The feed still runs without it, so the app
     * reports the missing piece rather than refusing to start.
     */
    private fun startCapture(capturePipeline: CapturePipeline, settings: CaptureSettings) {
        val projection = CaptureConsent.consume(this)
        if (projection == null) {
            val message = getString(R.string.freehands_error_capture_consent)
            recorder?.record(SessionRecorder.EVENT_ERROR, JSONObject().put("message", message))
            AgentRuntime.update { it.copy(lastError = message) }
            return
        }
        val source = ScreenCaptureSource(
            pipeline = capturePipeline,
            settings = settings,
            screenDensity = profile.screenDensity,
            onError = { message ->
                recorder?.record(SessionRecorder.EVENT_ERROR, JSONObject().put("message", message))
                AgentRuntime.update { it.copy(lastError = message) }
            },
        )
        capture = source
        if (!source.start(projection)) {
            capture = null
        }
    }

    /**
     * Builds the inference router. The endpoint and key are injected at build
     * time, never committed: an API key in the repository would be a leak, and a
     * build without them simply has no cloud route.
     */
    private fun buildInference(): LocalInferenceService = LocalInferenceService(
        local = LiteLLMInference.open(this),
        cloud = OpenHandsCloudInference.fromConfig(
            baseUrl = BuildConfig.FREEHANDS_CLOUD_BASE_URL,
            apiKey = BuildConfig.FREEHANDS_CLOUD_API_KEY,
            model = BuildConfig.FREEHANDS_CLOUD_MODEL,
        ),
        connectivity = ConnectivityProbe { isOnline() },
    )

    /**
     * Runs one goal on a background thread and publishes the result. A second
     * goal is refused while one is running so two loops cannot fight over the
     * same device.
     */
    private fun runAgent(goal: String) {
        val inferenceService = inference
        val actionDispatcher = dispatcher
        val provider = observationProvider
        val frameSource = latestFrame
        if (inferenceService == null || actionDispatcher == null || provider == null || frameSource == null) {
            AgentRuntime.update { it.copy(lastError = getString(R.string.freehands_error_agent_dependencies)) }
            return
        }
        if (FreeHandsAccessibilityService.current() == null) {
            AgentRuntime.update { it.copy(lastError = getString(R.string.freehands_error_accessibility_disabled)) }
            return
        }
        if (!agentRunning.compareAndSet(false, true)) return
        AgentRuntime.update { it.copy(currentPlan = goal, lastError = "") }

        val loop = AgentBridge(
            planner = InferenceAgentPlanner(inferenceService, recorder),
            dispatcher = actionDispatcher,
            ownsDispatcher = false,
            observer = {
                provider.observe(
                    FreeHandsAccessibilityService.current()?.captureTree(),
                    frameSource?.latest(),
                )
            },
            verifier = verifier,
            recorder = recorder,
        )
        agentLoop = loop

        Thread({
            try {
                val results = loop.run(goal)
                recorder?.record("agent_goal_done", JSONObject().put("steps", results.size))
            } catch (error: Exception) {
                recorder?.record(
                    SessionRecorder.EVENT_ERROR,
                    JSONObject().put("message", error.message.orEmpty()),
                )
                AgentRuntime.update { it.copy(lastError = error.message ?: getString(R.string.freehands_error_agent_dependencies)) }
            } finally {
                agentRunning.set(false)
                agentLoop = null
                publishState()
            }
        }, "freehands-agent").apply {
            isDaemon = true
            start()
        }
        publishState()
    }

    private fun stopAgent() {
        if (!started) {
            return
        }
        started = false
        agentLoop?.cancel()
        agentRunning.set(false)
        healthServer?.stop()
        healthServer = null
        capture?.stop()
        capture = null
        pipeline?.recordSummary()
        pipeline = null
        feedServer?.stop()
        bridge?.stop()
        bridge?.close()
        dispatcher?.close()
        decoder?.release()
        inference?.close()
        recorder?.record(SessionRecorder.EVENT_SERVICE_STOP)
        recorder?.close()

        feedServer = null
        bridge = null
        dispatcher = null
        decoder = null
        recorder = null
        latestFrame = null
        verifier = null
        observationProvider = null
        inference = null
        FreeHandsAccessibilityService.recorder = null

        AgentRuntime.update { it.copy(serviceRunning = false, feedRunning = false, connectedViewers = 0, agentRunning = false, currentPlan = "") }
    }

    /** Routes an action to the accessibility service. */
    private fun executeOnDevice(action: AgentAction): ActionResult {
        val service = FreeHandsAccessibilityService.current()
            ?: return ActionResult.Failed(getString(R.string.freehands_error_accessibility_disabled))
        return service.execute(action)
    }

    /** Whether the device currently has a usable network route. */
    private fun isOnline(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            ?: return false
        return manager.activeNetworkInfo != null
    }

    /**
     * Publishes a loopback health endpoint describing every component. A bind
     * failure is recorded but never stops the agent: the feed is the product,
     * the endpoint is diagnostics.
     */
    private fun startHealthEndpoint(server: LiveFeedServer, dispatcher: ActionDispatcher) {
        healthRegistry
            .registerBoolean(HealthRegistry.COMPONENT_FEED_SERVER, "live feed transport") { server.isRunning }
            .registerBoolean(HealthRegistry.COMPONENT_NATIVE_BRIDGE, "native capture bridge") {
                ScrcpyBridge.isAvailable && bridge?.isRunning() == true
            }
            .registerBoolean(HealthRegistry.COMPONENT_CAPTURE, "screen capture") {
                capture?.isRunning == true
            }
            .registerBoolean(HealthRegistry.COMPONENT_ACCESSIBILITY, "accessibility service") {
                FreeHandsAccessibilityService.isEnabled()
            }
            .registerBoolean(HealthRegistry.COMPONENT_AGENT, "action dispatcher") { dispatcher.isRunning }
            .registerBoolean(HealthRegistry.COMPONENT_INFERENCE, "on-device inference") {
                inference?.localAvailable == true
            }
            .registerBoolean(HealthRegistry.COMPONENT_VERIFIER, "action verifier") {
                verifier != null && latestFrame?.latest() != null
            }
            .registerBoolean(HealthRegistry.COMPONENT_AGENT_LOOP, "agent loop") {
                agentLoop != null || !agentRunning.get()
            }
        val endpoint = HealthCheckServer(healthRegistry)
        healthServer = try {
            endpoint.start()
            endpoint
        } catch (error: IllegalStateException) {
            recorder?.record(SessionRecorder.EVENT_ERROR, JSONObject().put("message", error.message.orEmpty()))
            null
        }
    }

    private fun publishState() {
        val server = feedServer
        AgentRuntime.update {
            it.copy(
                serviceRunning = started,
                feedRunning = server?.isRunning == true,
                nativeBridgeAvailable = ScrcpyBridge.isAvailable,
                captureRunning = capture?.isRunning == true,
                accessibilityConnected = FreeHandsAccessibilityService.isEnabled(),
                agentRunning = agentRunning.get(),
                connectedViewers = server?.clientCount ?: 0,
                tier = server?.effectiveTier() ?: QualityTier.HIGH,
                latency = server?.latencySnapshot()
                    ?: LatencySnapshot(LatencyBudget.DEFAULT_BUDGET_MS, List(5) { 0L }, 0),
                framesBroadcast = server?.broadcastFrames ?: 0,
                framesDropped = server?.droppedFrames ?: 0,
            )
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.freehands_notification_channel),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.freehands_notification_channel_description)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, LiveFeedActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, AgentExecutionService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle(getString(R.string.freehands_notification_title))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(openApp)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, getString(R.string.freehands_notification_stop), stop)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_START = "dev.openhands.agentcanvas.freehands.action.START"
        const val ACTION_STOP = "dev.openhands.agentcanvas.freehands.action.STOP"
        const val ACTION_CANCEL_GOAL = "dev.openhands.agentcanvas.freehands.action.CANCEL_GOAL"
        const val MAX_GOAL_LENGTH = 4000
        const val ACTION_RUN_GOAL = "dev.openhands.agentcanvas.freehands.action.RUN_GOAL"
        const val EXTRA_GOAL = "dev.openhands.agentcanvas.freehands.extra.GOAL"
        private const val CHANNEL_ID = "freehands_agent"
        private const val NOTIFICATION_ID = 4711
        private const val RECORDINGS_DIRECTORY = "freehands-sessions"

        /** The running service, or null when it is not started. */
        @Volatile
        private var instance: AgentExecutionService? = null

        /**
         * The preview consumer, held statically so the activity can attach
         * before the service has built its feed server.
         */
        @Volatile
        private var pendingPreview: VideoDecoder? = null

        fun current(): AgentExecutionService? = instance

        /** Routes the in-app preview decoder to the running feed, if any. */
        fun attachPreview(decoder: VideoDecoder?) {
            pendingPreview = decoder
            instance?.feedServer?.setObserver(decoder)
        }

        fun start(context: Context) {
            val intent = Intent(context, AgentExecutionService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun cancelGoal(context: Context) {
            context.startService(Intent(context, AgentExecutionService::class.java).setAction(ACTION_CANCEL_GOAL))
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, AgentExecutionService::class.java).setAction(ACTION_STOP),
            )
        }

        /** Starts the agent, if needed, and routes one goal to it. */
        fun runGoal(context: Context, goal: String) {
            val trimmed = goal.trim()
            require(trimmed.isNotEmpty() && trimmed.length <= MAX_GOAL_LENGTH) { "Enter a goal between 1 and $MAX_GOAL_LENGTH characters" }
            val intent = Intent(context, AgentExecutionService::class.java)
                .setAction(ACTION_RUN_GOAL)
                .putExtra(EXTRA_GOAL, trimmed)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
