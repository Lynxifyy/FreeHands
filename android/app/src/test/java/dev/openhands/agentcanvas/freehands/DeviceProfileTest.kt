package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceProfileTest {

    private fun profile(
        model: String = "Pixel 8",
        manufacturer: String = "Google",
        totalRamMb: Long = 8192,
        cpuCores: Int = 8,
        maxCpuFrequencyKhz: Long = 2_800_000,
    ) = DeviceProfile(
        model = model,
        manufacturer = manufacturer,
        androidVersion = "15",
        sdkInt = 35,
        totalRamMb = totalRamMb,
        availableRamMb = totalRamMb / 2,
        cpuCores = cpuCores,
        maxCpuFrequencyKhz = maxCpuFrequencyKhz,
        screenWidth = 1080,
        screenHeight = 2400,
        screenDensity = 420,
    )

    @Test
    fun `a flagship suggests the highest tier`() {
        val device = profile()

        assertFalse(device.isLowMemory)
        assertFalse(device.isLowEnd)
        assertEquals(QualityTier.HIGH, device.suggestedTier())
    }

    @Test
    fun `low memory forces the lowest tier`() {
        val device = profile(totalRamMb = 1024)

        assertTrue(device.isLowMemory)
        assertTrue(device.isLowEnd)
        assertEquals(QualityTier.LOW, device.suggestedTier())
    }

    @Test
    fun `a weak cpu suggests the middle tier`() {
        val device = profile(totalRamMb = 4096, cpuCores = 4)

        assertTrue(device.isLowEnd)
        assertEquals(QualityTier.MEDIUM, device.suggestedTier())
    }

    @Test
    fun `detects an emulator by model name`() {
        assertTrue(profile(model = "sdk_gphone64_x86_64").isEmulator)
        assertTrue(profile(model = "Android SDK built for x86").isEmulator)
        assertFalse(profile(model = "Pixel 8 Pro").isEmulator)
    }

    @Test
    fun `detects an emulator by manufacturer`() {
        assertTrue(profile(model = "Custom", manufacturer = "Genymotion").isEmulator)
    }

    @Test
    fun `caps fps on low end devices`() {
        assertEquals(8, profile(totalRamMb = 1024).suggestedFps())
        assertEquals(15, profile(cpuCores = 8).suggestedFps())
        assertEquals(12, profile(cpuCores = 6).suggestedFps())
    }

    @Test
    fun `treats an unknown cpu frequency as not low end by itself`() {
        val device = profile(maxCpuFrequencyKhz = 0)

        assertFalse(device.isLowEnd)
    }

    @Test
    fun `an unknown total ram is not treated as low memory`() {
        assertFalse(profile(totalRamMb = 0).isLowMemory)
    }
}
