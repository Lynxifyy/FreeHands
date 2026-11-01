package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class H264AccessUnitNormalizerTest {

    private val normalizer = H264AccessUnitNormalizer()

    private fun annexB(vararg nals: ByteArray): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        nals.forEach {
            out.write(H264AccessUnitNormalizer.START_CODE)
            out.write(it)
        }
        return out.toByteArray()
    }

    private fun lengthPrefixed(vararg nals: ByteArray): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        nals.forEach {
            out.write(it.size ushr 24 and 0xFF)
            out.write(it.size ushr 16 and 0xFF)
            out.write(it.size ushr 8 and 0xFF)
            out.write(it.size and 0xFF)
            out.write(it)
        }
        return out.toByteArray()
    }

    private val sps = byteArrayOf(0x67, 0x42, 0x00, 0x1E)
    private val pps = byteArrayOf(0x68, 0xCE.toByte(), 0x38, 0x80.toByte())
    private val idr = byteArrayOf(0x65, 0x88.toByte(), 0x84.toByte())
    private val slice = byteArrayOf(0x41, 0x9A.toByte(), 0x01)

    @Test
    fun `annex-b input is passed through unchanged`() {
        val input = annexB(sps, idr)

        assertArrayEquals(input, normalizer.normalize(input))
    }

    @Test
    fun `length prefixed input becomes annex-b`() {
        val normalized = normalizer.normalize(lengthPrefixed(sps, idr))

        assertArrayEquals(annexB(sps, idr), normalized)
    }

    @Test
    fun `bare nal gets a start code`() {
        assertArrayEquals(annexB(slice), normalizer.normalize(slice))
    }

    @Test
    fun `keyframe without in-band sps gets the codec config prepended`() {
        val normalized = normalizer.normalize(idr, listOf(sps, pps))

        assertArrayEquals(annexB(sps, pps, idr), normalized)
    }

    @Test
    fun `keyframe that already carries sps is not duplicated`() {
        val input = annexB(sps, pps, idr)

        assertArrayEquals(input, normalizer.normalize(input, listOf(sps, pps)))
    }

    @Test
    fun `empty input yields empty output`() {
        assertTrue(normalizer.normalize(ByteArray(0)).isEmpty())
    }

    @Test
    fun `detects sps in an annex-b buffer`() {
        assertTrue(normalizer.containsSps(annexB(sps, idr)))
        assertFalse(normalizer.containsSps(annexB(slice)))
    }

    @Test
    fun `strips a leading start code`() {
        assertArrayEquals(sps, normalizer.withoutStartCode(annexB(sps)))
        assertArrayEquals(sps, normalizer.withoutStartCode(sps))
    }
}
