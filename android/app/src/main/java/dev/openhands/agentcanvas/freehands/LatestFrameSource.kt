package dev.openhands.agentcanvas.freehands

import java.util.concurrent.atomic.AtomicReference

/**
 * Holds the most recent decoded frame for the verifier and the UI.
 *
 * Only the newest frame matters for a live feed, so this is a single-slot
 * holder rather than a queue: a consumer that falls behind should see the
 * latest screen, not a backlog. Frames arrive on the native capture thread and
 * are read from the agent thread, hence the atomic reference.
 */
class LatestFrameSource : FrameSource {

    private val latest = AtomicReference<LumaFrame?>(null)

    /** Replaces the held frame. Returns the previous frame, if any. */
    fun publish(frame: LumaFrame): LumaFrame? = latest.getAndSet(frame)

    override fun latest(): LumaFrame? = latest.get()

    fun clear() {
        latest.set(null)
    }
}
