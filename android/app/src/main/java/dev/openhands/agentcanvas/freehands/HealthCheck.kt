package dev.openhands.agentcanvas.freehands

import org.json.JSONArray
import org.json.JSONObject

/** Health of one component of the stack. */
enum class HealthState { UP, DEGRADED, DOWN }

/** Health of a single named component. */
data class ComponentHealth(
    val name: String,
    val state: HealthState,
    val detail: String = "",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("name", name)
        .put("state", state.name.lowercase())
        .put("detail", detail)
}

/** Aggregate health report. */
data class HealthReport(
    val components: List<ComponentHealth>,
) {
    val overall: HealthState
        get() = when {
            components.any { it.state == HealthState.DOWN } -> HealthState.DOWN
            components.any { it.state == HealthState.DEGRADED } -> HealthState.DEGRADED
            else -> HealthState.UP
        }

    val healthy: Boolean get() = overall == HealthState.UP

    fun component(name: String): ComponentHealth? = components.firstOrNull { it.name == name }

    fun toJson(): JSONObject {
        val array = JSONArray()
        components.forEach { array.put(it.toJson()) }
        return JSONObject()
            .put("status", overall.name.lowercase())
            .put("healthy", healthy)
            .put("components", array)
    }
}

/** Produces the health of one component on demand. */
fun interface HealthProbe {
    fun probe(): ComponentHealth
}

/**
 * Registry of component health probes backing the health-check endpoint.
 *
 * Probes are pulled lazily on each [report] call so the endpoint reflects the
 * live state rather than a cached snapshot. A probe that throws is reported as
 * DOWN with the exception message instead of failing the whole request: a
 * health endpoint that itself 500s is useless during an incident.
 */
class HealthRegistry {

    private val probes = LinkedHashMap<String, HealthProbe>()

    fun register(name: String, probe: HealthProbe): HealthRegistry {
        probes[name] = probe
        return this
    }

    fun unregister(name: String) {
        probes.remove(name)
    }

    fun report(): HealthReport = HealthReport(
        probes.map { (name, probe) ->
            try {
                probe.probe()
            } catch (error: Throwable) {
                ComponentHealth(
                    name = name,
                    state = HealthState.DOWN,
                    detail = "probe threw ${error::class.java.simpleName}: ${error.message.orEmpty()}",
                )
            }
        },
    )

    /** Convenience probe for a boolean predicate. */
    fun registerBoolean(name: String, detail: String = "", probe: () -> Boolean): HealthRegistry =
        register(name) {
            ComponentHealth(
                name = name,
                state = if (probe()) HealthState.UP else HealthState.DOWN,
                detail = detail,
            )
        }

    companion object {
        const val COMPONENT_FEED_SERVER = "live_feed_server"
        const val COMPONENT_NATIVE_BRIDGE = "native_bridge"
        const val COMPONENT_CAPTURE = "screen_capture"
        const val COMPONENT_ACCESSIBILITY = "accessibility_service"
        const val COMPONENT_AGENT = "agent_loop"
        const val COMPONENT_INFERENCE = "local_inference"
        const val COMPONENT_VERIFIER = "action_verifier"
        const val COMPONENT_AGENT_LOOP = "agent_loop_runner"
    }
}
