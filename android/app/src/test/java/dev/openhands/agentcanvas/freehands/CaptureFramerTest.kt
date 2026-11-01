package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureFramerTest {

    private val sps = byteArrayOf(0x67, 0x42, 0x00, 0x1E)
    private val idr = byteArrayOf(0x65, 0x88.toByte(), 0x84.toByte())

    private fun framer(clock: () -> Long = System::nanoTime) = CaptureFramer(
        width = 1080,
        height = 1920,
        bitrateKbps = 4000,
        clock = clock,
    )

    @Test
    fun `stamps a microsecond capture timestamp from the clock`() {
        val framer = framer(clock = { 5_000_000L })

        val frame = framer.frame(idr, keyframe = false)!!

        assertEquals(5_000L, frame.captureTimestampUs)
    }

    @Test
    fun `stamps the encoder geometry on every frame`() {
        val frame = framer().frame(idr, keyframe = false)!!

        assertEquals(1080, frame.width)
        assertEquals(1920, frame.height)
        assertEquals(4000, frame.bitrateKbps)
    }

    @Test
    fun `empty buffers produce no frame`() {
        val framer = framer()

        assertNull(framer.frame(ByteArray(0), keyframe = true))
    }

    @Test
    fun `keyframe carries the codec config once the encoder delivered it`() {
        val framer = framer()
        assertFalse(framer.hasCodecConfig)
        framer.onCodecConfig(listOf(sps))

        val frame = framer.frame(idr, keyframe = true)!!

        assertTrue(framer.hasCodecConfig)
        assertTrue(frame.keyframe)
        assertArrayEquals(
            H264AccessUnitNormalizer.START_CODE + sps + H264AccessUnitNormalizer.START_CODE + idr,
            frame.data,
        )
    }

    @Test
    fun `non-keyframes never carry the codec config`() {
        val framer = framer()
        framer.onCodecConfig(listOf(sps))

        val frame = framer.frame(idr, keyframe = false)!!

        assertArrayEquals(H264AccessUnitNormalizer.START_CODE + idr, frame.data)
    }

    @Test
    fun `ignores empty codec config buffers`() {
        val framer = framer()
        framer.onCodecConfig(listOf(ByteArray(0)))

        assertFalse(framer.hasCodecConfig)
    }
}
