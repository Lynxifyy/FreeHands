package dev.openhands.agentcanvas.freehands

import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class YuvLumaReaderTest {

    private fun buffer(vararg bytes: Int): ByteBuffer =
        ByteBuffer.allocate(bytes.size).also { target ->
            bytes.forEach { target.put(it.toByte()) }
            target.rewind()
        }

    @Test
    fun `reads a tightly packed luma plane as grey pixels`() {
        val plane = buffer(0, 128, 255, 16)

        val pixels = YuvLumaReader.readLuma(plane, width = 4, height = 1, rowStrideBytes = 4)!!

        assertEquals(0xFF000000.toInt(), pixels[0])
        assertEquals(0xFF808080.toInt(), pixels[1])
        assertEquals(0xFFFFFFFF.toInt(), pixels[2])
        assertEquals(0xFF101010.toInt(), pixels[3])
    }

    @Test
    fun `honours the row stride padding`() {
        // Two rows of two pixels, each row padded by two bytes.
        val plane = buffer(
            10, 20, 0xAA, 0xBB,
            30, 40, 0xAA, 0xBB,
        )

        val pixels = YuvLumaReader.readLuma(plane, width = 2, height = 2, rowStrideBytes = 4)!!

        assertEquals(0xFF0A0A0A.toInt(), pixels[0])
        assertEquals(0xFF141414.toInt(), pixels[1])
        assertEquals(0xFF1E1E1E.toInt(), pixels[2])
        assertEquals(0xFF282828.toInt(), pixels[3])
    }

    @Test
    fun `honours a pixel stride wider than one byte`() {
        val plane = buffer(5, 0, 6, 0)

        val pixels = YuvLumaReader.readLuma(plane, width = 2, height = 1, rowStrideBytes = 4, pixelStrideBytes = 2)!!

        assertEquals(0xFF050505.toInt(), pixels[0])
        assertEquals(0xFF060606.toInt(), pixels[1])
    }

    @Test
    fun `returns null when the buffer is too small`() {
        val plane = buffer(1, 2, 3)

        assertNull(YuvLumaReader.readLuma(plane, width = 8, height = 8, rowStrideBytes = 8))
    }

    @Test
    fun `returns null for degenerate dimensions`() {
        val plane = buffer(1, 2, 3, 4)

        assertNull(YuvLumaReader.readLuma(plane, width = 0, height = 1, rowStrideBytes = 4))
        assertNull(YuvLumaReader.readLuma(plane, width = 1, height = 0, rowStrideBytes = 4))
    }

    @Test
    fun `does not disturb the source buffer position`() {
        val plane = buffer(9, 9, 9, 9)
        plane.position(3)

        YuvLumaReader.readLuma(plane, width = 1, height = 1, rowStrideBytes = 1)

        assertEquals(3, plane.position())
    }
}
