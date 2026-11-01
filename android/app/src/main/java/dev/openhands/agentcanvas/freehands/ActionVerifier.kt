package dev.openhands.agentcanvas.freehands

/** Whether an action visibly changed the screen. */
enum class VerificationOutcome {
    /** The screen changed in the expected region within the wait window. */
    VERIFIED,

    /** The screen did not change before the deadline. */
    UNCHANGED,

    /** No frame was available to compare (capture stalled). */
    INCONCLUSIVE,
}

/** Result of verifying one action against the following frames. */
data class VerificationResult(
    val outcome: VerificationOutcome,
    val waitedMs: Long,
    val diff: FrameDiff?,
    val detail: String = "",
)

/** Source of the latest decoded frame, fed by the capture pipeline. */
fun interface FrameSource {
    /** Latest frame, or null when no frame has arrived yet. */
    fun latest(): LumaFrame?
}

/**
 * Confirms that an action had an effect by watching the frames that follow it.
 *
 * Without this the agent cannot tell a successful tap from one that missed, so
 * it would retry blindly. Verification samples the frame stream after the
 * action until the screen differs meaningfully from the pre-action frame, or
 * the wait window elapses.
 *
 * The wait window is bounded by the latency budget so a stalled capture cannot
 * hang the agent loop; on timeout the outcome is UNCHANGED, which the caller
 * treats as a failed action.
 */
class ActionVerifier(
    private val frameSource: FrameSource,
    private val analyzer: FrameAnalyzer = FrameAnalyzer(),
    private val pollIntervalMs: Long = DEFAULT_POLL_INTERVAL_MS,
    private val waitWindowMs: Long = DEFAULT_WAIT_WINDOW_MS,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
    private val clock: () -> Long = System::currentTimeMillis,
) {

    /** Captures the pre-action frame to compare against. */
    fun captureBaseline(): LumaFrame? = frameSource.latest()

    /**
     * Waits for the screen to change relative to [baseline].
     *
     * A null [baseline] yields INCONCLUSIVE rather than a false VERIFIED: not
     * having seen the "before" state means the change cannot be attributed to
     * the action.
     */
    fun awaitChange(baseline: LumaFrame?): VerificationResult {
        if (baseline == null) {
            return VerificationResult(
                outcome = VerificationOutcome.INCONCLUSIVE,
                waitedMs = 0,
                diff = null,
                detail = "no baseline frame captured",
            )
        }

        val start = clock()
        var elapsed = 0L
        var lastDiff: FrameDiff? = null
        while (elapsed <= waitWindowMs) {
            val current = frameSource.latest()
            if (current != null) {
                val diff = analyzer.diff(baseline, current)
                lastDiff = diff
                if (diff.isSignificant()) {
                    return VerificationResult(
                        outcome = VerificationOutcome.VERIFIED,
                        waitedMs = elapsed,
                        diff = diff,
                        detail = "changed ${"%.2f".format(diff.changedFraction * 100)}% of the screen",
                    )
                }
            }
            sleep(pollIntervalMs)
            elapsed = clock() - start
        }

        return VerificationResult(
            outcome = VerificationOutcome.UNCHANGED,
            waitedMs = elapsed,
            diff = lastDiff,
            detail = "no significant change within ${waitWindowMs}ms",
        )
    }

    companion object {
        const val DEFAULT_POLL_INTERVAL_MS = 16L
        const val DEFAULT_WAIT_WINDOW_MS = 1500L
    }
}
