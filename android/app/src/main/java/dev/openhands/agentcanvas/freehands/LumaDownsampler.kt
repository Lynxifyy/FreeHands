package dev.openhands.agentcanvas.freehands

/**
 * Turns a decoded bitmap into the downsampled luma grid the analyzer diffs.
 *
 * The verifier only needs to know *where* the screen changed, so the full
 * bitmap is reduced to a small grid by averaging each block. Doing the reduction
 * here, on the decode thread, keeps the analyzer independent of Android
 * graphics types and keeps the per-frame cost inside the latency budget.
 */
object LumaDownsampler {

    /** Default grid width; the height follows the source aspect ratio. */
    const val DEFAULT_GRID_WIDTH = 64

    /**
     * Downsamples [argb] (row-major, [width] x [height]) to at most
     * [gridWidth] columns. Returns null when the input is degenerate.
     */
    fun downsample(argb: IntArray, width: Int, height: Int, gridWidth: Int = DEFAULT_GRID_WIDTH): LumaFrame? {
        if (width <= 0 || height <= 0 || argb.size < width * height || gridWidth <= 0) {
            return null
        }
        val columns = gridWidth.coerceAtMost(width)
        val rows = (columns * height / width).coerceAtLeast(1)
        val blockWidth = width.toDouble() / columns
        val blockHeight = height.toDouble() / rows
        val luma = IntArray(columns * rows)

        for (row in 0 until rows) {
            val yStart = (row * blockHeight).toInt().coerceIn(0, height - 1)
            val yEnd = ((row + 1) * blockHeight).toInt().coerceIn(yStart + 1, height)
            for (column in 0 until columns) {
                val xStart = (column * blockWidth).toInt().coerceIn(0, width - 1)
                val xEnd = ((column + 1) * blockWidth).toInt().coerceIn(xStart + 1, width)
                var sum = 0L
                var count = 0
                for (y in yStart until yEnd) {
                    val rowOffset = y * width
                    for (x in xStart until xEnd) {
                        sum += lumaOf(argb[rowOffset + x])
                        count++
                    }
                }
                luma[row * columns + column] = if (count == 0) 0 else (sum / count).toInt()
            }
        }
        return LumaFrame(columns, rows, luma)
    }

    /** ITU-R BT.601 luma of a packed ARGB pixel. */
    fun lumaOf(pixel: Int): Int {
        val red = pixel shr 16 and 0xFF
        val green = pixel shr 8 and 0xFF
        val blue = pixel and 0xFF
        return (red * 77 + green * 150 + blue * 29) shr 8
    }
}
