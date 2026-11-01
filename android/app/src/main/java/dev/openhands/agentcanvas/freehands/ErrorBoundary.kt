package dev.openhands.agentcanvas.freehands

import org.json.JSONObject

/**
 * Global crash handler that keeps the agent alive across failures.
 *
 * When an uncaught exception reaches a thread's default handler the process is
 * normally torn down, taking the foreground service and the live feed with it.
 * This handler records the crash, then asks [restart] to bring the agent
 * service back. Restarts are budgeted: at most [maxRestarts] within
 * [restartWindowMs]. Once the budget is exhausted the crash is handed to the
 * previous handler so a genuinely broken build fails loudly instead of
 * restart-looping.
 *
 * [restart] runs on the crashing thread and must be quick and non-throwing; a
 * throw from it is swallowed and the crash is propagated instead.
 */
class ErrorBoundary(
    private val restart: () -> Unit,
    private val previous: Thread.UncaughtExceptionHandler? = Thread.getDefaultUncaughtExceptionHandler(),
    private val recorder: SessionRecorder? = null,
    private val clock: () -> Long = System::currentTimeMillis,
    private val maxRestarts: Int = DEFAULT_MAX_RESTARTS,
    private val restartWindowMs: Long = DEFAULT_RESTART_WINDOW_MS,
) : Thread.UncaughtExceptionHandler {

    private val lock = Any()
    private val restartTimestamps = ArrayDeque<Long>()

    var crashCount: Int = 0
        private set

    var restartCount: Int = 0
        private set

    /** Installs this handler as the process default. */
    fun install() {
        Thread.setDefaultUncaughtExceptionHandler(this)
    }

    /** Restores the handler that was installed before [install]. */
    fun uninstall() {
        Thread.setDefaultUncaughtExceptionHandler(previous)
    }

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        crashCount++
        val withinBudget = synchronized(lock) {
            val now = clock()
            evictExpired(now)
            if (restartTimestamps.size >= maxRestarts) {
                false
            } else {
                restartTimestamps.addLast(now)
                true
            }
        }

        recorder?.record(
            SessionRecorder.EVENT_ERROR,
            JSONObject()
                .put("kind", "uncaught_exception")
                .put("thread", thread.name)
                .put("throwable", throwable::class.java.name)
                .put("message", throwable.message.orEmpty())
                .put("restarting", withinBudget),
        )

        if (!withinBudget) {
            propagate(thread, throwable)
            return
        }

        try {
            restart()
            restartCount++
        } catch (restartFailure: Throwable) {
            recorder?.record(
                SessionRecorder.EVENT_ERROR,
                JSONObject()
                    .put("kind", "restart_failed")
                    .put("throwable", restartFailure::class.java.name)
                    .put("message", restartFailure.message.orEmpty()),
            )
            propagate(thread, throwable)
        }
    }

    private fun propagate(thread: Thread, throwable: Throwable) {
        val handler = previous
        if (handler != null && handler !== this) {
            handler.uncaughtException(thread, throwable)
        }
    }

    private fun evictExpired(now: Long) {
        val cutoff = now - restartWindowMs
        while (restartTimestamps.isNotEmpty() && restartTimestamps.first() <= cutoff) {
            restartTimestamps.removeFirst()
        }
    }

    companion object {
        const val DEFAULT_MAX_RESTARTS = 3
        const val DEFAULT_RESTART_WINDOW_MS = 60_000L
    }
}
