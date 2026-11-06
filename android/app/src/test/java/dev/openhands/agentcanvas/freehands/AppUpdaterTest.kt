package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdaterTest {

    private fun asset(name: String) = AppUpdater.ReleaseAsset(name, "https://x/$name")

    @Test
    fun `prefers the release apk over the debug build`() {
        val picked = AppUpdater.pickAndroidAsset(
            listOf(
                asset("agent-canvas-1.30.0-debug.apk"),
                asset("agent-canvas-1.30.0.apk"),
            ),
        )
        assertEquals("agent-canvas-1.30.0.apk", picked?.name)
    }

    @Test
    fun `falls back to the debug apk when it is the only one`() {
        val picked = AppUpdater.pickAndroidAsset(
            listOf(asset("agent-canvas-1.30.0-debug.apk")),
        )
        assertEquals("agent-canvas-1.30.0-debug.apk", picked?.name)
    }

    @Test
    fun `ignores non apk assets`() {
        assertNull(
            AppUpdater.pickAndroidAsset(
                listOf(asset("Agent-Canvas-1.30.0.exe"), asset("x.dmg")),
            ),
        )
    }

    @Test
    fun `detects a newer patch`() {
        assertTrue(AppUpdater.isNewer("1.29.1", "1.29.0"))
        assertFalse(AppUpdater.isNewer("1.29.0", "1.29.0"))
        assertFalse(AppUpdater.isNewer("1.28.9", "1.29.0"))
    }

    @Test
    fun `treats a missing segment as zero`() {
        assertTrue(AppUpdater.isNewer("1.30", "1.29.9"))
        assertTrue(AppUpdater.isNewer("2.0.0", "1.99.99"))
    }

    @Test
    fun `strips a leading v and ignores a prerelease suffix`() {
        assertTrue(AppUpdater.isNewer("v1.30.0", "1.29.0"))
        assertFalse(AppUpdater.isNewer("1.30.0-rc.1", "1.30.0"))
    }

    @Test
    fun `never reports an update for unparseable versions`() {
        assertFalse(AppUpdater.isNewer("nightly", "1.29.0"))
        assertFalse(AppUpdater.isNewer("1.30.0", "unknown"))
        assertFalse(AppUpdater.isNewer("", "1.29.0"))
    }
}
