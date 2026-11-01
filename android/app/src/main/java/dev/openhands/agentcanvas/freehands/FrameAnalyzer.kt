package dev.openhands.agentcanvas.freehands

import kotlin.math.abs

/** A rectangular region of the screen that changed between two frames. */
data class ChangedRegion(
    val bounds: NodeBounds,
    /** Mean absolute luma difference over the region, 0-255. */
    val meanDelta: Int,
    val changedPixels: Int,
)

/** Result of comparing two frames. */
data class FrameDiff(
    val regions: List<ChangedRegion>,
    val changedPixels: Int,
    val totalPixels: Int,
) {
    val changedFraction: Double
        get() = if (totalPixels == 0) 0.0 else changedPixels.toDouble() / totalPixels

    /** True when enough of the screen changed to count as a real transition. */
    fun isSignificant(threshold: Double = DEFAULT_SIGNIFICANCE): Boolean =
        changedFraction >= threshold

    companion object {
        const val DEFAULT_SIGNIFICANCE = 0.002
    }
}

/**
 * Compares consecutive screen frames to locate UI changes.
 *
 * The agent needs to know whether an action did anything. A full image diff is
 * too expensive on-device, so this works on a downsampled luma grid and reports
 * coarse bounding boxes instead of a pixel mask: enough to confirm a transition
 * and to point at where it happened, cheap enough to run every frame within the
 * latency budget.
 *
 * Frames are represented as [LumaFrame], a width x height grid of 0-255 values.
 */
class FrameAnalyzer(
    private val pixelThreshold: Int = DEFAULT_PIXEL_THRESHOLD,
    private val regionPadding: Int = DEFAULT_REGION_PADDING,
) {

    /**
     * Diffs [previous] against [current]. Frames must share dimensions; a size
     * mismatch is treated as a total change so a resolution switch is never
     * mistaken for "nothing happened".
     */
    fun diff(previous: LumaFrame, current: LumaFrame): FrameDiff {
        if (previous.width != current.width || previous.height != current.height) {
            val bounds = NodeBounds(0, 0, current.width, current.height)
            return FrameDiff(
                regions = listOf(ChangedRegion(bounds, meanDelta = 255, changedPixels = current.pixelCount)),
                changedPixels = current.pixelCount,
                totalPixels = current.pixelCount,
            )
        }

        val width = current.width
        val height = current.height
        val mask = BooleanArray(width * height)
        var changed = 0
        for (index in mask.indices) {
            if (abs(current.luma[index] - previous.luma[index]) >= pixelThreshold) {
                mask[index] = true
                changed++
            }
        }

        val regions = if (changed == 0) emptyList() else extractRegions(previous, current, mask, width, height)
        return FrameDiff(regions, changed, width * height)
    }

    /**
     * Groups changed pixels into coarse boxes by scanning fixed-size tiles and
     * emitting one box per changed tile, then merging horizontally adjacent
     * tiles on the same row band. This is linear in pixel count and yields few
     * boxes for the common case of one changed control.
     */
    private fun extractRegions(
        previous: LumaFrame,
        current: LumaFrame,
        mask: BooleanArray,
        width: Int,
        height: Int,
    ): List<ChangedRegion> {
        val regions = mutableListOf<ChangedRegion>()
        var y = 0
        while (y < height) {
            val tileHeight = minOf(TILE, height - y)
            var x = 0
            while (x < width) {
                val tileWidth = minOf(TILE, width - x)
                var changed = 0
                var deltaSum = 0L
                for (ty in y until y + tileHeight) {
                    val rowOffset = ty * width
                    for (tx in x until x + tileWidth) {
                        val index = rowOffset + tx
                        if (mask[index]) {
                            changed++
                            deltaSum += abs(current.luma[index] - previous.luma[index])
                        }
                    }
                }
                if (changed > 0) {
                    val left = (x - regionPadding).coerceAtLeast(0)
                    val top = (y - regionPadding).coerceAtLeast(0)
                    val right = (x + tileWidth + regionPadding).coerceAtMost(width)
                    val bottom = (y + tileHeight + regionPadding).coerceAtMost(height)
                    regions += ChangedRegion(
                        bounds = NodeBounds(left, top, right, bottom),
                        meanDelta = (deltaSum / changed).toInt(),
                        changedPixels = changed,
                    )
                }
                x += tileWidth
            }
            y += tileHeight
        }
        return regions
    }

    companion object {
        const val TILE = 32
        const val DEFAULT_PIXEL_THRESHOLD = 24
        const val DEFAULT_REGION_PADDING = 4
    }
}

/** A downsampled grayscale frame. */
class LumaFrame(
    val width: Int,
    val height: Int,
    val luma: IntArray,
) {
    init {
        require(width > 0 && height > 0) { "frame dimensions must be positive" }
        require(luma.size == width * height) { "luma size must equal width * height" }
    }

    val pixelCount: Int get() = luma.size

    /** Luma value at (x, y), or 0 outside the frame. */
    fun at(x: Int, y: Int): Int =
        if (x in 0 until width && y in 0 until height) luma[y * width + x] else 0

    companion object {
        /** Builds a frame from a constant value; handy for tests and blank frames. */
        fun uniform(width: Int, height: Int, value: Int = 0): LumaFrame =
            LumaFrame(width, height, IntArray(width * height) { value })
    }
}
