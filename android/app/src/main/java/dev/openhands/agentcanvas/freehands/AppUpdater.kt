package dev.openhands.agentcanvas.freehands

/**
 * Pure helpers for the in-app updater, kept free of the Android framework so
 * they can be unit-tested on the JVM (see `AppUpdaterTest`).
 *
 * The WebView picks which release asset to install and drives the UI; the
 * native side only downloads and hands the file to the package installer. The
 * shared rules that must match between the two live here.
 */
object AppUpdater {

    /** A downloadable release artifact. */
    data class ReleaseAsset(val name: String, val url: String)

    /**
     * The release (non-debug) APK for this platform, or null when the release
     * ships none. A `-debug` build is only used when no release build exists.
     */
    fun pickAndroidAsset(assets: List<ReleaseAsset>): ReleaseAsset? {
        val apks = assets.filter { it.name.lowercase().endsWith(".apk") }
        return apks.firstOrNull { !it.name.lowercase().contains("debug") }
            ?: apks.firstOrNull()
    }

    /**
     * Whether `latest` is newer than `installed`. Compares dotted numeric
     * segments left to right; a missing segment counts as zero, so `1.30`
     * is newer than `1.29.9`. Returns false when either is unparseable, so a
     * malformed tag never prompts an install.
     */
    fun isNewer(latest: String, installed: String): Boolean {
        val a = parse(latest) ?: return false
        val b = parse(installed) ?: return false
        val length = maxOf(a.size, b.size)
        for (i in 0 until length) {
            val left = a.getOrElse(i) { 0 }
            val right = b.getOrElse(i) { 0 }
            if (left != right) return left > right
        }
        return false
    }

    /** A version's leading numeric segments, or null when it has none. */
    private fun parse(version: String): List<Int>? {
        val trimmed = version.trim().removePrefix("v").removePrefix("V")
        if (trimmed.isEmpty()) return null
        val segments = trimmed
            .substringBefore('-')
            .split('.')
            .map { part -> part.toIntOrNull() ?: return null }
        return if (segments.isEmpty()) null else segments
    }

    /** Cache directory the APK is downloaded into before install. */
    const val APK_FILE_NAME = "freehands-update.apk"
}
