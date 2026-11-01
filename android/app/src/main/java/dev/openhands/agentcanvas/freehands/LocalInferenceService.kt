package dev.openhands.agentcanvas.freehands

/** Where an inference request was served from. */
enum class InferenceRoute { LOCAL, CLOUD }

/** Result of one inference request. */
data class InferenceResult(
    val text: String,
    val route: InferenceRoute,
    val latencyMs: Long,
    val model: String,
    // Token counts are null when the route cannot measure them. The cloud
    // endpoint does not report usage here, and inventing a number would make
    // the metrics look precise while being wrong.
    val promptTokens: Long? = null,
    val completionTokens: Long? = null,
)

/** Thrown when no route can serve a request. */
class InferenceUnavailableException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** Runs a prompt on the on-device model. */
interface LocalInference {
    /** Model identifier, for reporting. */
    val modelName: String

    fun generate(prompt: String, maxTokens: Int): String
}

/**
 * An inference route that can report how many tokens the last request used.
 *
 * The native engine knows the real counts, so it reports them; a route that
 * only has a string answer (a cloud endpoint that returns no usage) simply does
 * not implement this, and the metrics fall back to an estimate.
 */
interface InferenceTelemetrySource {
    /** Prompt and completion tokens for the most recent request. */
    fun lastTokenCounts(): Pair<Long, Long>
}

/** Runs a prompt on a remote model. */
interface CloudInference {
    val modelName: String

    fun generate(prompt: String, maxTokens: Int): String
}

/** Reports whether the device is currently online. */
fun interface ConnectivityProbe {
    fun isOnline(): Boolean
}

/**
 * Routes agent inference between the on-device model and the cloud.
 *
 * Offline first: when the device has no network, or the local model is present,
 * the request is served on-device so the agent keeps working without a
 * connection. The cloud is the fallback for when the local model is absent or
 * fails, not the default.
 *
 * A local failure is retried in the cloud when online, so a transient local
 * error (a model still loading, a thermal throttle) degrades to a slower answer
 * instead of a failed step.
 */
class LocalInferenceService(
    private val local: LocalInference?,
    private val cloud: CloudInference?,
    private val connectivity: ConnectivityProbe,
    private val preferLocal: Boolean = true,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    val localAvailable: Boolean get() = local != null

    val cloudAvailable: Boolean get() = cloud != null

    fun isOnline(): Boolean = connectivity.isOnline()

    /**
     * Serves [prompt], preferring the route selected by [preferLocal] and the
     * current connectivity. Throws [InferenceUnavailableException] only when
     * neither route can serve the request.
     */
    fun generate(prompt: String, maxTokens: Int = DEFAULT_MAX_TOKENS): InferenceResult {
        val order = routeOrder()
        if (order.isEmpty()) {
            throw InferenceUnavailableException("no inference route available")
        }

        var lastError: Throwable? = null
        for (route in order) {
            val start = clock()
            try {
                val text = when (route) {
                    InferenceRoute.LOCAL -> local!!.generate(prompt, maxTokens)
                    InferenceRoute.CLOUD -> cloud!!.generate(prompt, maxTokens)
                }
                val model = when (route) {
                    InferenceRoute.LOCAL -> local!!.modelName
                    InferenceRoute.CLOUD -> cloud!!.modelName
                }
                val tokens = (when (route) {
                    InferenceRoute.LOCAL -> local
                    InferenceRoute.CLOUD -> cloud
                } as? InferenceTelemetrySource)?.lastTokenCounts()
                return InferenceResult(
                    text = text,
                    route = route,
                    latencyMs = clock() - start,
                    model = model,
                    promptTokens = tokens?.first,
                    completionTokens = tokens?.second,
                )
            } catch (error: Exception) {
                lastError = error
            }
        }

        throw InferenceUnavailableException(
            "every inference route failed",
            lastError,
        )
    }

    /** The routes to try, in order, given connectivity and preference. */
    fun routeOrder(): List<InferenceRoute> {
        val online = connectivity.isOnline()
        val localFirst = preferLocal && local != null
        val order = mutableListOf<InferenceRoute>()
        if (localFirst) {
            order += InferenceRoute.LOCAL
        }
        if (online && cloud != null) {
            order += InferenceRoute.CLOUD
        }
        if (!localFirst && local != null) {
            order += InferenceRoute.LOCAL
        }
        return order
    }

    companion object {
        const val DEFAULT_MAX_TOKENS = 512
    }
}
