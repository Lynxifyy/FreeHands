package dev.openhands.agentcanvas.freehands

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthCheckServerTest {

    private fun get(port: Int, method: String = "GET"): Triple<Int, String, String> {
        val connection = URL("http://127.0.0.1:$port/healthz").openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 2000
        connection.readTimeout = 2000
        return try {
            val status = connection.responseCode
            val stream = if (status < 400) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            Triple(status, body, connection.contentType.orEmpty())
        } finally {
            connection.disconnect()
        }
    }

    @Test
    fun `serves an ok report when every component is up`() {
        val registry = HealthRegistry()
            .registerBoolean(HealthRegistry.COMPONENT_FEED_SERVER, "live feed") { true }
            .registerBoolean(HealthRegistry.COMPONENT_NATIVE_BRIDGE, "native bridge") { true }
        val server = HealthCheckServer(registry, port = 0)
        server.start()
        try {
            val (status, body, contentType) = get(server.boundPort)

            assertEquals(200, status)
            assertTrue(contentType.startsWith("application/json"))
            val json = JSONObject(body)
            assertEquals("up", json.getString("status"))
            assertTrue(json.getBoolean("healthy"))
            assertEquals(2, json.getJSONArray("components").length())
        } finally {
            server.stop()
        }
    }

    @Test
    fun `answers 503 when a component is down`() {
        val registry = HealthRegistry().registerBoolean(HealthRegistry.COMPONENT_NATIVE_BRIDGE) { false }
        val server = HealthCheckServer(registry, port = 0)
        server.start()
        try {
            val (status, body) = get(server.boundPort)

            assertEquals(503, status)
            assertFalse(JSONObject(body).getBoolean("healthy"))
        } finally {
            server.stop()
        }
    }

    @Test
    fun `rejects a non-get request`() {
        val server = HealthCheckServer(HealthRegistry().registerBoolean("feed") { true }, port = 0)
        server.start()
        try {
            val status = get(server.boundPort, method = "POST").first

            assertEquals(405, status)
        } finally {
            server.stop()
        }
    }

    @Test
    fun `start and stop are idempotent and release the port`() {
        val server = HealthCheckServer(HealthRegistry(), port = 0)
        server.start()
        val port = server.boundPort
        assertTrue(server.isRunning)
        assertTrue(port > 0)

        server.start()
        assertEquals(port, server.boundPort)

        server.stop()
        assertFalse(server.isRunning)
        assertEquals(0, server.boundPort)

        server.stop()
        assertFalse(server.isRunning)
    }
}
