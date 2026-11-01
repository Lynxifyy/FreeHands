package dev.openhands.agentcanvas.freehands

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.File

/**
 * Thin, null-safe access to the Android platform values the agent stack needs.
 *
 * Each call is defensive: a missing system service or an unreadable /proc entry
 * returns a sensible default instead of throwing, so a device with unusual
 * firmware degrades to a conservative profile rather than crashing the agent.
 */
object AndroidEnvironment {

    @Volatile
    private var appContext: Context? = null

    /** Must be called once from Application.onCreate before profile detection. */
    fun initialise(context: Context) {
        appContext = context.applicationContext
    }

    fun model(): String = Build.MODEL.orEmpty()

    fun manufacturer(): String = Build.MANUFACTURER.orEmpty()

    fun androidVersion(): String = Build.VERSION.RELEASE.orEmpty()

    fun sdkInt(): Int = Build.VERSION.SDK_INT

    fun activityManager(): ActivityManager? = appContext
        ?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager

    /** Returns (totalMb, availableMb) or null when the service is unavailable. */
    fun memoryInfo(activityManager: ActivityManager): Pair<Long, Long>? = try {
        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        val megabyte = 1024L * 1024L
        Pair(info.totalMem / megabyte, info.availMem / megabyte)
    } catch (error: RuntimeException) {
        null
    }

    /**
     * Highest CPU frequency in kHz, read from sysfs. Returns 0 when the file is
     * missing (common on some devices), which callers treat as "unknown".
     */
    fun maxCpuFrequencyKhz(): Long {
        val candidates = listOf(
            "/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq",
            "/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq",
        )
        for (path in candidates) {
            try {
                val value = File(path).readText().trim().toLongOrNull()
                if (value != null && value > 0) {
                    return value
                }
            } catch (error: Exception) {
                // Try the next candidate.
            }
        }
        return 0L
    }

    fun screenWidth(): Int = displayMetrics()?.widthPixels ?: 0

    fun screenHeight(): Int = displayMetrics()?.heightPixels ?: 0

    fun screenDensity(): Int = displayMetrics()?.densityDpi ?: 0

    private fun displayMetrics(): DisplayMetrics? {
        val context = appContext ?: return null
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            ?: return null
        return DisplayMetrics().also { windowManager.defaultDisplay.getMetrics(it) }
    }
}
