package dev.openhands.agentcanvas.freehands

/** Encoder dimensions, frame rate and bitrate for one capture session. */
data class CaptureSettings(
    val width: Int,
    val height: Int,
    val fps: Int,
    val bitrateKbps: Int,
) {
    /** True when both dimensions are even and positive, as H.264 requires. */
    val isValid: Boolean
        get() = width > 0 && height > 0 && width % 2 == 0 && height % 2 == 0 && fps > 0
}

/**
 * Chooses encoder parameters from the device screen and profile.
 *
 * H.264 encoders reject odd dimensions, and every device reports a slightly
 * different panel size, so the screen is scaled to fit the tier's long edge and
 * then rounded down to an even number. Bitrate scales with pixel count so a
 * small screen does not waste bandwidth and a large one does not starve.
 */
object CaptureGeometry {

    /** Long edge, in pixels, for each quality tier. */
    fun longEdgeFor(tier: QualityTier): Int = when (tier) {
        QualityTier.HIGH -> 1920
        QualityTier.MEDIUM -> 1280
        QualityTier.LOW -> 854
    }

    /** Bits per pixel per second used to derive the bitrate. */
    const val BITS_PER_PIXEL = 0.10

    const val MIN_BITRATE_KBPS = 1_000
    const val MAX_BITRATE_KBPS = 12_000

    /**
     * Builds encoder parameters for a [screenWidth] x [screenHeight] panel.
     *
     * The shorter edge keeps its aspect ratio and the result is forced even.
     * A degenerate screen size falls back to the tier's square long edge rather
     * than producing an unusable zero-sized encoder.
     */
    fun forScreen(
        screenWidth: Int,
        screenHeight: Int,
        tier: QualityTier,
        fps: Int,
    ): CaptureSettings {
        val targetLongEdge = longEdgeFor(tier)
        val longest = maxOf(screenWidth, screenHeight)
        val shortest = minOf(screenWidth, screenHeight)
        if (longest <= 0 || shortest <= 0) {
            val edge = evenFloor(targetLongEdge)
            return CaptureSettings(edge, edge, fps.coerceAtLeast(1), bitrateFor(edge * edge, fps))
        }

        val scale = if (longest > targetLongEdge) {
            targetLongEdge.toDouble() / longest
        } else {
            1.0
        }
        val longEdge = evenFloor((longest * scale).toInt())
        val shortEdge = evenFloor((shortest * scale).toInt())
        val width = if (screenWidth >= screenHeight) longEdge else shortEdge
        val height = if (screenWidth >= screenHeight) shortEdge else longEdge
        val safeFps = fps.coerceAtLeast(1)
        return CaptureSettings(width, height, safeFps, bitrateFor(width * height, safeFps))
    }

    /** Bitrate in kbps for [pixels] at [fps], clamped to a sane range. */
    fun bitrateFor(pixels: Int, fps: Int): Int {
        val bitsPerSecond = pixels.toDouble() * BITS_PER_PIXEL * fps.coerceAtLeast(1)
        val kbps = (bitsPerSecond / 1000.0).toInt()
        return kbps.coerceIn(MIN_BITRATE_KBPS, MAX_BITRATE_KBPS)
    }

    /** Largest even value not greater than [value], with a floor of 2. */
    fun evenFloor(value: Int): Int = (value - value % 2).coerceAtLeast(2)
}
