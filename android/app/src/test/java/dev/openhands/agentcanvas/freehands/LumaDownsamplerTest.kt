package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LumaDownsamplerTest {

    @Test
    fun `downsamples to the requested grid width`() {
        val argb = IntArray(200 * 100) { 0xFF000000.toInt() }

        val frame = LumaDownsampler.downsample(argb, width = 200, height = 100, gridWidth = 50)!!

        assertEquals(50, frame.width)
        assertEquals(25, frame.height)
    }

    @Test
    fun `a grid wider than the image is clamped to the image width`() {
        val argb = IntArray(10 * 4)

        val frame = LumaDownsampler.downsample(argb, width = 10, height = 4, gridWidth = 64)!!

        assertEquals(10, frame.width)
    }

    @Test
    fun `white and black blocks average to their luma`() {
        val white = 0xFFFFFFFF.toInt()
        val black = 0xFF000000.toInt()
        val argb = IntArray(4 * 4) { index -> if (index % 4 < 2) white else black }

        val frame = LumaDownsampler.downsample(argb, width = 4, height = 4, gridWidth = 2)!!

        assertTrue(frame.at(0, 0) > 240)
        assertTrue(frame.at(1, 0) < 15)
    }

    @Test
    fun `computes bt601 luma for the primaries`() {
        assertEquals(255, LumaDownsampler.lumaOf(0xFFFFFFFF.toInt()))
        assertEquals(0, LumaDownsampler.lumaOf(0xFF000000.toInt()))
        assertEquals(76, LumaDownsampler.lumaOf(0xFFFF0000.toInt()))
        assertEquals(149, LumaDownsampler.lumaOf(0xFF00FF00.toInt()))
    }

    @Test
    fun `degenerate input yields null`() {
        assertNull(LumaDownsampler.downsample(IntArray(0), width = 0, height = 0))
        assertNull(LumaDownsampler.downsample(IntArray(4), width = 4, height = 4))
    }
}
