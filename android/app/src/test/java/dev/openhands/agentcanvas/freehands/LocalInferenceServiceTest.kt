package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalInferenceServiceTest {

    private val online = ConnectivityProbe { true }
    private val offline = ConnectivityProbe { false }

    private fun local(text: String = "local answer", fail: Boolean = false) = object : LocalInference {
        override val modelName: String = "litert-gemma-2b"
        override fun generate(prompt: String, maxTokens: Int): String {
            if (fail) throw RuntimeException("model not loaded")
            return text
        }
    }

    private fun cloud(text: String = "cloud answer", fail: Boolean = false) = object : CloudInference {
        override val modelName: String = "gpt-5.5"
        override fun generate(prompt: String, maxTokens: Int): String {
            if (fail) throw RuntimeException("network error")
            return text
        }
    }

    @Test
    fun `prefers local when both routes are available`() {
        val service = LocalInferenceService(local(), cloud(), online)

        val result = service.generate("hello")

        assertEquals(InferenceRoute.LOCAL, result.route)
        assertEquals("local answer", result.text)
        assertEquals("litert-gemma-2b", result.model)
    }

    @Test
    fun `serves locally while offline`() {
        val service = LocalInferenceService(local(), cloud(), offline)

        val result = service.generate("hello")

        assertEquals(InferenceRoute.LOCAL, result.route)
        assertEquals(listOf(InferenceRoute.LOCAL), service.routeOrder())
    }

    @Test
    fun `falls back to the cloud when local fails and the device is online`() {
        val service = LocalInferenceService(local(fail = true), cloud(), online)

        val result = service.generate("hello")

        assertEquals(InferenceRoute.CLOUD, result.route)
        assertEquals("cloud answer", result.text)
    }

    @Test
    fun `uses the cloud when no local model is present`() {
        val service = LocalInferenceService(local = null, cloud = cloud(), connectivity = online)

        val result = service.generate("hello")

        assertEquals(InferenceRoute.CLOUD, result.route)
    }

    @Test(expected = InferenceUnavailableException::class)
    fun `throws when no route can serve an offline request without a local model`() {
        LocalInferenceService(local = null, cloud = cloud(), connectivity = offline).generate("hello")
    }

    @Test(expected = InferenceUnavailableException::class)
    fun `throws when every route fails`() {
        LocalInferenceService(local(fail = true), cloud(fail = true), online).generate("hello")
    }

    @Test
    fun `can prefer the cloud`() {
        val service = LocalInferenceService(local(), cloud(), online, preferLocal = false)

        val result = service.generate("hello")

        assertEquals(InferenceRoute.CLOUD, result.route)
    }

    @Test
    fun `reports availability`() {
        val service = LocalInferenceService(local(), null, online)

        assertTrue(service.localAvailable)
        assertEquals(false, service.cloudAvailable)
        assertTrue(service.isOnline())
    }

    @Test
    fun `route order puts local first when preferred`() {
        val service = LocalInferenceService(local(), cloud(), online)

        assertEquals(listOf(InferenceRoute.LOCAL, InferenceRoute.CLOUD), service.routeOrder())
    }

    @Test
    fun `reports the token counts the local engine measured`() {
        val measured = object : LocalInference, InferenceTelemetrySource {
            override val modelName: String = "litert"
            override fun generate(prompt: String, maxTokens: Int): String = "ok"
            override fun lastTokenCounts(): Pair<Long, Long> = 42L to 7L
        }

        val result = LocalInferenceService(measured, null, offline).generate("hello")

        assertEquals(42L, result.promptTokens)
        assertEquals(7L, result.completionTokens)
    }

    @Test
    fun `leaves the token counts unset when the route cannot measure them`() {
        val service = LocalInferenceService(local(), cloud(), online)

        val result = service.generate("hello")

        assertEquals(null, result.promptTokens)
        assertEquals(null, result.completionTokens)
    }

    @Test
    fun `reports the cloud route when the local engine cannot serve the request`() {
        val service = LocalInferenceService(local(fail = true), cloud(), online)

        val result = service.generate("hello")

        assertEquals(InferenceRoute.CLOUD, result.route)
        assertEquals(null, result.promptTokens)
    }
}
