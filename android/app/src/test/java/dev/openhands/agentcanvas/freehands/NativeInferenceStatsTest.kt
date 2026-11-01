package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeInferenceStatsTest {

    @Test
    fun `decodes the native stats array`() {
        val stats = NativeInferenceStats.fromNative(
            longArrayOf(12, 5, 40, 250, 17, 3),
        )

        assertEquals(12, stats.promptTokens)
        assertEquals(5, stats.generatedTokens)
        assertEquals(40, stats.prefillMs)
        assertEquals(250, stats.decodeMs)
        assertEquals(17, stats.tokensPerSecond)
        assertEquals(3, stats.kvEvictions)
    }

    @Test
    fun `a short array decodes to zeroes instead of failing`() {
        val stats = NativeInferenceStats.fromNative(longArrayOf(4))

        assertEquals(4, stats.promptTokens)
        assertEquals(0, stats.generatedTokens)
        assertEquals(0, stats.tokensPerSecond)
    }

    @Test
    fun `a missing array decodes to zeroes`() {
        val stats = NativeInferenceStats.fromNative(null)

        assertEquals(0, stats.promptTokens)
        assertEquals(0, stats.generatedTokens)
    }

    @Test
    fun `decodes the model info array`() {
        val info = NativeModelInfo.fromNative(longArrayOf(768, 12, 32000, 2048))

        assertEquals(768, info.dModel)
        assertEquals(12, info.layers)
        assertEquals(32000, info.vocabSize)
        assertEquals(2048, info.maxContext)
        assertTrue(info.isLoaded)
    }

    @Test
    fun `a zeroed model info reports nothing loaded`() {
        val info = NativeModelInfo.fromNative(null)

        assertEquals(0, info.dModel)
        assertTrue(!info.isLoaded)
    }
}
