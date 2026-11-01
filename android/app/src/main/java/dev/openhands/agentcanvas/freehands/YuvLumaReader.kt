package dev.openhands.agentcanvas.freehands

import java.nio.ByteBuffer

/**
 * Reads the luma plane of a decoded YUV image as packed grey pixels.
 *
 * The verifier only needs brightness, and the decoder already produces a luma
 * plane, so there is no reason to convert chroma or build a full colour bitmap:
 * reading plane 0 is the cheapest possible path from decoded frames to a
 * diffable grid.
 *
 * The plane is padded to a hardware stride, so the row stride is honoured. The
 * reader is kept free of Android graphics types so it runs on the JVM.
 */
object YuvLumaReader {

    /**
     * Copies the luma plane into an ARGB array where each pixel is grey.
     *
     * [pixelStrideBytes] is normally 1 for a luma plane, but some decoders
     * interleave, so it is honoured. Returns null when the buffer cannot hold
     * the described image.
     */
    fun readLuma(
        buffer: ByteBuffer,
        width: Int,
        height: Int,
        rowStrideBytes: Int,
        pixelStrideBytes: Int = 1,
    ): IntArray? {
        if (width <= 0 || height <= 0 || rowStrideBytes <= 0 || pixelStrideBytes <= 0) {
            return null
        }
        val required = (height - 1) * rowStrideBytes + (width - 1) * pixelStrideBytes + 1
        if (buffer.capacity() < required) {
            return null
        }
        val pixels = IntArray(width * height)
        val source = buffer.duplicate()
        for (row in 0 until height) {
            val rowStart = row * rowStrideBytes
            val output = row * width
            for (column in 0 until width) {
                val luma = source.get(rowStart + column * pixelStrideBytes).toInt() and 0xFF
                pixels[output + column] = (0xFF shl 24) or (luma shl 16) or (luma shl 8) or luma
            }
        }
        return pixels
    }
}
