package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameAnalyzerTest {

    private val analyzer = FrameAnalyzer()

    private fun frame(width: Int, height: Int, fill: (Int, Int) -> Int): LumaFrame =
        LumaFrame(width, height, IntArray(width * height) { index ->
            fill(index % width, index / width)
        })

    @Test
    fun `identical frames report no change`() {
        val before = LumaFrame.uniform(64, 64, 128)
        val after = LumaFrame.uniform(64, 64, 128)

        val diff = analyzer.diff(before, after)

        assertEquals(0, diff.changedPixels)
        assertTrue(diff.regions.isEmpty())
        assertFalse(diff.isSignificant())
    }

    @Test
    fun `a localised change is reported as a region`() {
        val before = LumaFrame.uniform(64, 64, 0)
        val after = LumaFrame(64, 64, IntArray(64 * 64) { index ->
            val x = index % 64
            val y = index / 64
            if (x in 8..24 && y in 8..24) 255 else 0
        })

        val diff = analyzer.diff(before, after)

        assertTrue(diff.changedPixels > 0)
        assertTrue(diff.isSignificant())
        val region = diff.regions.first()
        assertTrue(region.bounds.left <= 8)
        assertTrue(region.bounds.right >= 25)
        assertEquals(255, region.meanDelta)
    }

    @Test
    fun `ignores changes below the pixel threshold`() {
        val before = LumaFrame.uniform(32, 32, 100)
        val after = LumaFrame.uniform(32, 32, 100 + FrameAnalyzer.DEFAULT_PIXEL_THRESHOLD - 1)

        val diff = analyzer.diff(before, after)

        assertEquals(0, diff.changedPixels)
    }

    @Test
    fun `a resolution change counts as a total change`() {
        val before = LumaFrame.uniform(32, 32, 0)
        val after = LumaFrame.uniform(64, 64, 0)

        val diff = analyzer.diff(before, after)

        assertEquals(after.pixelCount, diff.changedPixels)
        assertEquals(1.0, diff.changedFraction, 0.0001)
    }

    @Test
    fun `regions are padded and clamped to the frame`() {
        val before = LumaFrame.uniform(64, 64, 0)
        val after = LumaFrame(64, 64, IntArray(64 * 64) { index ->
            if (index % 64 == 0) 255 else 0
        })

        val diff = analyzer.diff(before, after)

        diff.regions.forEach { region ->
            assertTrue(region.bounds.left >= 0)
            assertTrue(region.bounds.top >= 0)
            assertTrue(region.bounds.right <= 64)
            assertTrue(region.bounds.bottom <= 64)
        }
    }

    @Test
    fun `changed fraction reflects the affected area`() {
        val before = LumaFrame.uniform(100, 100, 0)
        val after = LumaFrame(100, 100, IntArray(100 * 100) { index ->
            if (index < 100) 255 else 0  // one full row of 100 of 10000 pixels
        })

        val diff = analyzer.diff(before, after)

        assertEquals(0.01, diff.changedFraction, 0.0001)
    }

    @Test
    fun `luma frame reads coordinates safely`() {
        val frame = LumaFrame(2, 2, intArrayOf(1, 2, 3, 4))

        assertEquals(1, frame.at(0, 0))
        assertEquals(4, frame.at(1, 1))
        assertEquals(0, frame.at(-1, 0))
        assertEquals(0, frame.at(2, 0))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `luma frame rejects a mismatched buffer`() {
        LumaFrame(2, 2, intArrayOf(1, 2, 3))
    }
}
