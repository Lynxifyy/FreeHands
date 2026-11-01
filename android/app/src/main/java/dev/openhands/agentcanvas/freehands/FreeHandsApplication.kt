package dev.openhands.agentcanvas.freehands

import android.app.Application

/**
 * Application entry point for the Free Hands agent stack.
 *
 * Installs the crash boundary before anything else so a failure during startup
 * is recorded and the agent service is brought back, and publishes the device
 * profile once so every component sees the same view of the hardware.
 */
class FreeHandsApplication : Application() {

    private var errorBoundary: ErrorBoundary? = null

    override fun onCreate() {
        super.onCreate()
        AndroidEnvironment.initialise(this)

        val boundary = ErrorBoundary(
            restart = { AgentExecutionService.start(this) },
            recorder = SessionRecorder(cacheDir),
        )
        boundary.install()
        errorBoundary = boundary

        AgentRuntime.update { it.copy(nativeBridgeAvailable = ScrcpyBridge.isAvailable) }
    }

    /** The installed crash boundary, exposed for diagnostics. */
    fun crashBoundary(): ErrorBoundary? = errorBoundary
}
