package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureGeometryTest {

    @Test
    fun `high tier caps the long edge at 1080p`() {
        val geometry = CaptureGeometry.forScreen(1440, 3120, QualityTier.HIGH, fps = 15)

        // 3120 * (1920 / 3120) = 1920 long edge; the 1440 short edge scales to 886.
        assertEquals(886, geometry.width)
        assertEquals(1920, geometry.height)
        assertTrue(geometry.isValid)
    }

    @Test
    fun `medium and low tiers use smaller long edges`() {
        assertEquals(1280, CaptureGeometry.forScreen(1080, 2400, QualityTier.MEDIUM, 12).height)
        assertEquals(854, CaptureGeometry.forScreen(1080, 2400, QualityTier.LOW, 8).height)
    }

    @Test
    fun `widths are derived from the scaled short edge`() {
        assertEquals(576, CaptureGeometry.forScreen(1080, 2400, QualityTier.MEDIUM, 12).width)
        assertEquals(384, CaptureGeometry.forScreen(1080, 2400, QualityTier.LOW, 8).width)
    }

    @Test
    fun `a screen smaller than the tier keeps its size`() {
        val geometry = CaptureGeometry.forScreen(720, 1280, QualityTier.HIGH, fps = 15)

        assertEquals(720, geometry.width)
        assertEquals(1280, geometry.height)
    }

    @Test
    fun `odd dimensions are rounded down to even`() {
        val geometry = CaptureGeometry.forScreen(1081, 2401, QualityTier.HIGH, fps = 15)

        assertEquals(0, geometry.width % 2)
        assertEquals(0, geometry.height % 2)
    }

    @Test
    fun `landscape screens keep their orientation`() {
        val geometry = CaptureGeometry.forScreen(2400, 1080, QualityTier.MEDIUM, fps = 12)

        assertEquals(1280, geometry.width)
        assertEquals(576, geometry.height)
    }

    @Test
    fun `a degenerate screen falls back to a square tier edge`() {
        val geometry = CaptureGeometry.forScreen(0, 0, QualityTier.LOW, fps = 8)

        assertEquals(854, geometry.width)
        assertEquals(854, geometry.height)
        assertTrue(geometry.isValid)
    }

    @Test
    fun `bitrate scales with pixel count and stays in range`() {
        val small = CaptureGeometry.bitrateFor(854 * 480, 8)
        val large = CaptureGeometry.bitrateFor(1920 * 1080, 15)

        assertTrue(small >= CaptureGeometry.MIN_BITRATE_KBPS)
        assertTrue(large <= CaptureGeometry.MAX_BITRATE_KBPS)
        assertTrue(large > small)
    }

    @Test
    fun `even floor never returns less than two`() {
        assertEquals(2, CaptureGeometry.evenFloor(1))
        assertEquals(2, CaptureGeometry.evenFloor(2))
        assertEquals(4, CaptureGeometry.evenFloor(5))
    }
}
