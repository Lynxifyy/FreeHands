package dev.openhands.agentcanvas.freehands

/**
 * Sliding-window rate limiter for agent actions.
 *
 * A runaway agent loop can otherwise hammer the device with taps faster than a
 * human could, which is both useless and unsafe. This limiter allows at most
 * [maxActions] actions per [windowMs]; the window slides, so a burst at the end
 * of one window does not stack on a burst at the start of the next.
 *
 * Time is injected via [clock] so the behaviour is deterministic in tests.
 */
class RateLimiter(
    private val maxActions: Int = DEFAULT_MAX_ACTIONS,
    private val windowMs: Long = DEFAULT_WINDOW_MS,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    init {
        require(maxActions > 0) { "maxActions must be positive" }
        require(windowMs > 0) { "windowMs must be positive" }
    }

    private val timestamps = ArrayDeque<Long>()

    /** Attempts to consume one slot. Returns false when the window is full. */
    @Synchronized
    fun tryAcquire(): Boolean {
        val now = clock()
        evictExpired(now)
        if (timestamps.size >= maxActions) {
            return false
        }
        timestamps.addLast(now)
        return true
    }

    /** Slots still available in the current window. */
    @Synchronized
    fun remaining(): Int {
        evictExpired(clock())
        return (maxActions - timestamps.size).coerceAtLeast(0)
    }

    /** Milliseconds until the next slot frees up, or 0 when one is available. */
    @Synchronized
    fun millisUntilAvailable(): Long {
        val now = clock()
        evictExpired(now)
        if (timestamps.size < maxActions) {
            return 0
        }
        val oldest = timestamps.first()
        return (oldest + windowMs - now).coerceAtLeast(0)
    }

    @Synchronized
    fun reset() {
        timestamps.clear()
    }

    private fun evictExpired(now: Long) {
        val cutoff = now - windowMs
        while (timestamps.isNotEmpty() && timestamps.first() <= cutoff) {
            timestamps.removeFirst()
        }
    }

    companion object {
        const val DEFAULT_MAX_ACTIONS = 120
        const val DEFAULT_WINDOW_MS = 60_000L
    }
}
