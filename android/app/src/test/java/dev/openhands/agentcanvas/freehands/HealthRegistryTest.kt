package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthRegistryTest {

    @Test
    fun `reports up when every component is up`() {
        val registry = HealthRegistry()
            .registerBoolean("feed") { true }
            .registerBoolean("bridge") { true }

        val report = registry.report()

        assertEquals(HealthState.UP, report.overall)
        assertTrue(report.healthy)
    }

    @Test
    fun `reports down when any component is down`() {
        val registry = HealthRegistry()
            .registerBoolean("feed") { true }
            .registerBoolean("bridge") { false }

        val report = registry.report()

        assertEquals(HealthState.DOWN, report.overall)
        assertFalse(report.healthy)
    }

    @Test
    fun `reports degraded when a component is degraded`() {
        val registry = HealthRegistry()
            .register("feed") { ComponentHealth("feed", HealthState.UP) }
            .register("bridge") { ComponentHealth("bridge", HealthState.DEGRADED) }

        val report = registry.report()

        assertEquals(HealthState.DEGRADED, report.overall)
    }

    @Test
    fun `a throwing probe becomes a down component`() {
        val registry = HealthRegistry().register("boom") { throw IllegalStateException("nope") }

        val report = registry.report()

        assertEquals(HealthState.DOWN, report.overall)
        assertTrue(report.component("boom")!!.detail.contains("nope"))
    }

    @Test
    fun `unregister removes a component`() {
        val registry = HealthRegistry().registerBoolean("feed") { true }
        registry.unregister("feed")

        assertTrue(registry.report().components.isEmpty())
    }

    @Test
    fun `serialises to json with a status field`() {
        val registry = HealthRegistry().registerBoolean("feed", "streaming") { true }

        val json = registry.report().toJson()

        assertEquals("up", json.getString("status"))
        assertTrue(json.getBoolean("healthy"))
        assertEquals(1, json.getJSONArray("components").length())
    }
}
