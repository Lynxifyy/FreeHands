package dev.openhands.agentcanvas.freehands

/** Device capabilities used to tune the agent and the stream. */
data class DeviceProfile(
    val model: String,
    val manufacturer: String,
    val androidVersion: String = "",
    val sdkInt: Int = 0,
    val totalRamMb: Long = 0,
    val availableRamMb: Long = 0,
    val cpuCores: Int = 8,
    val maxCpuFrequencyKhz: Long = 2_800_000,
    val screenWidth: Int = 1080,
    val screenHeight: Int = 1920,
    val screenDensity: Int = 420,
) {
    /** True when the device is an emulator rather than physical hardware. */
    val isEmulator: Boolean
        get() = model.contains("sdk", ignoreCase = true) ||
            model.contains("emulator", ignoreCase = true) ||
            manufacturer.contains("Genymotion", ignoreCase = true)

    /** True when the device is low on memory and should stream conservatively. */
    val isLowMemory: Boolean get() = totalRamMb in 1 until LOW_MEMORY_THRESHOLD_MB

    /** True when the device cannot sustain the richest stream tier. */
    val isLowEnd: Boolean
        get() = isLowMemory || cpuCores <= 4 || maxCpuFrequencyKhz in 1 until LOW_END_FREQ_KHZ

    /**
     * Suggests a starting quality tier. The controller can still adapt from
     * here at runtime; this only avoids starting a weak device on 1080p.
     */
    fun suggestedTier(): QualityTier = when {
        isLowMemory -> QualityTier.LOW
        isLowEnd -> QualityTier.MEDIUM
        else -> QualityTier.HIGH
    }

    /** Frame rate the device should target, capped by CPU count. */
    fun suggestedFps(): Int = when {
        isLowEnd -> 8
        cpuCores >= 8 -> 15
        else -> 12
    }

    companion object {
        const val LOW_MEMORY_THRESHOLD_MB = 2048L
        const val LOW_END_FREQ_KHZ = 1_800_000L
    }
}

/**
 * Detects the running device's profile. The probes are injectable so the
 * classification logic is testable without an Android runtime.
 */
object DeviceProfileDetector {

    fun detect(): DeviceProfile {
        val runtime = Runtime.getRuntime()
        val activityManager = AndroidEnvironment.activityManager()
        val memoryInfo = activityManager?.let { AndroidEnvironment.memoryInfo(it) }
        val totalRamMb = memoryInfo?.first ?: (runtime.maxMemory() / MEGABYTE)
        val availableRamMb = memoryInfo?.second ?: (runtime.freeMemory() / MEGABYTE)

        return DeviceProfile(
            model = AndroidEnvironment.model(),
            manufacturer = AndroidEnvironment.manufacturer(),
            androidVersion = AndroidEnvironment.androidVersion(),
            sdkInt = AndroidEnvironment.sdkInt(),
            totalRamMb = totalRamMb,
            availableRamMb = availableRamMb,
            cpuCores = runtime.availableProcessors(),
            maxCpuFrequencyKhz = AndroidEnvironment.maxCpuFrequencyKhz(),
            screenWidth = AndroidEnvironment.screenWidth(),
            screenHeight = AndroidEnvironment.screenHeight(),
            screenDensity = AndroidEnvironment.screenDensity(),
        )
    }

    private const val MEGABYTE = 1024L * 1024L
}
