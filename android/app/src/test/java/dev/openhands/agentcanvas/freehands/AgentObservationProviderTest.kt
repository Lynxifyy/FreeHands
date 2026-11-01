package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentObservationProviderTest {

    private val tree = UiNode(
        id = "root",
        className = "android.widget.FrameLayout",
        text = null,
        contentDescription = null,
        clickable = false,
        scrollable = false,
        editable = false,
        enabled = true,
        focused = false,
        bounds = NodeBounds(0, 0, 1080, 1920),
        depth = 0,
        children = listOf(
            UiNode(
                id = "button",
                className = "android.widget.Button",
                text = "Continue",
                contentDescription = null,
                clickable = true,
                scrollable = false,
                editable = false,
                enabled = true,
                focused = false,
                bounds = NodeBounds(40, 100, 400, 200),
                depth = 1,
            ),
        ),
    )

    private fun provider(clock: () -> Long = { 1_000L }) = AgentObservationProvider(
        screenWidth = { 1080 },
        screenHeight = { 1920 },
        focusedPackage = { "com.example.app" },
        clock = clock,
    )

    @Test
    fun `flattens the tree into the observation`() {
        val observation = provider().observe(tree, frame = null)

        assertEquals(2, observation.nodes.size)
        assertEquals("root", observation.nodes[0].id)
        assertEquals("button", observation.nodes[1].id)
    }

    @Test
    fun `numbers each observation in sequence`() {
        val provider = provider()

        assertEquals(1L, provider.observe(tree, null).sequence)
        assertEquals(2L, provider.observe(tree, null).sequence)
    }

    @Test
    fun `a null tree yields an empty node list`() {
        val observation = provider().observe(tree = null, frame = null)

        assertTrue(observation.nodes.isEmpty())
    }

    @Test
    fun `reports the focused package and drops a blank one`() {
        assertEquals("com.example.app", provider().observe(tree, null).focusedPackage)

        val blank = AgentObservationProvider({ 1080 }, { 1920 }, { "  " })
        assertNull(blank.observe(tree, null).focusedPackage)
    }

    @Test
    fun `attaches a visual fingerprint of the latest frame`() {
        val frame = LumaFrame.uniform(2, 2, 0)

        val observation = provider().observe(tree, frame)

        assertEquals("    ", observation.visualDigest!!.toString(Charsets.US_ASCII))
    }

    @Test
    fun `fingerprint spans the brightness ramp`() {
        val dark = AgentObservationProvider({ 1 }, { 1 }, { null })
        val bright = AgentObservationProvider({ 1 }, { 1 }, { null })

        val darkDigest = dark.fingerprint(LumaFrame.uniform(1, 1, 0)).toString(Charsets.US_ASCII)
        val brightDigest = bright.fingerprint(LumaFrame.uniform(1, 1, 255)).toString(Charsets.US_ASCII)

        assertEquals(AgentObservationProvider.RAMP.first().toString(), darkDigest)
        assertEquals(AgentObservationProvider.RAMP.last().toString(), brightDigest)
    }

    @Test
    fun `fingerprint distinguishes different screens of the same size`() {
        val provider = provider()
        val first = LumaFrame.uniform(2, 2, 0)
        val second = LumaFrame(2, 2, intArrayOf(0, 0, 255, 255))

        assertTrue(
            !provider.fingerprint(first).contentEquals(provider.fingerprint(second)),
        )
    }
}
