package dev.openhands.agentcanvas.freehands

/**
 * Builds the observation the planner reasons over.
 *
 * The accessibility tree is authoritative for what the agent can act on, but a
 * planner that only sees node text cannot tell a spinner from a loaded screen.
 * The latest luma frame is attached as a coarse fingerprint so the planner can
 * tell two visually different screens with identical text apart, and so a step
 * that changed nothing is visible in the history.
 *
 * The fingerprint is a small summary rather than the frame itself: the planner
 * is remote and a raw grid would cost more tokens than the tree it accompanies.
 */
class AgentObservationProvider(
    private val screenWidth: () -> Int,
    private val screenHeight: () -> Int,
    private val focusedPackage: () -> String?,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    private var sequence = 0L

    /** Builds one observation from the current tree and latest frame. */
    fun observe(tree: UiNode?, frame: LumaFrame?): AgentObservation {
        sequence++
        return AgentObservation(
            timestampMs = clock(),
            sequence = sequence,
            screenWidth = screenWidth(),
            screenHeight = screenHeight(),
            focusedPackage = focusedPackage()?.takeIf { it.isNotBlank() },
            nodes = tree?.flatten() ?: emptyList(),
            visualDigest = frame?.let { fingerprint(it) },
        )
    }

    /**
     * Renders a luma grid as a compact digest: one character per cell, from
     * dark to light. Cheap to compute and enough for the planner to notice that
     * the screen changed between two steps.
     */
    fun fingerprint(frame: LumaFrame): ByteArray {
        val out = StringBuilder(frame.pixelCount)
        for (value in frame.luma) {
            out.append(RAMP[(value.coerceIn(0, 255) * (RAMP.length - 1)) / 255])
        }
        return out.toString().toByteArray(Charsets.US_ASCII)
    }

    companion object {
        const val RAMP = " .:-=+*#%@"
    }
}
