package dev.openhands.agentcanvas.freehands

import android.content.Context
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * On-device inference backed by the lite-llm native engine.
 *
 * The engine is a separate native library (`liblitertlm`). When it is not
 * packaged — a build without the model runtime, or a device whose ABI it does
 * not cover — [open] returns null and the agent routes to the cloud instead of
 * pretending to run a model it does not have.
 */
class LiteLLMInference private constructor(
    handle: Long,
    override val modelName: String,
) : LocalInference, InferenceTelemetrySource {

    // Zeroed on close so a second close is a no-op rather than a double free.
    private var handle: Long = handle

    override fun generate(prompt: String, maxTokens: Int): String {
        val text = nativeGenerate(handle, prompt, maxTokens)
        lastStats = NativeInferenceStats.fromNative(nativeLastStats(handle))
        return text
    }

    /** Timings from the most recent [generate] call. */
    var lastStats: NativeInferenceStats = NativeInferenceStats.EMPTY
        private set

    /** The loaded model's dimensions, or an empty report when none is loaded. */
    val modelInfo: NativeModelInfo get() = NativeModelInfo.fromNative(nativeModelInfo(handle))

    /** The math backend actually serving generation, e.g. "cpu". */
    val backendName: String get() = nativeBackendName(handle)

    override fun lastTokenCounts(): Pair<Long, Long> =
        lastStats.promptTokens to lastStats.generatedTokens

    /**
     * Asks the current [generate] to stop. Safe from another thread, which is
     * what the UI's stop button uses.
     */
    fun cancel() = nativeCancel(handle)

    /** Releases the native session. Idempotent. */
    override fun close() {
        val current = handle
        if (current != 0L) {
            handle = 0L
            nativeClose(current)
        }
    }

    private external fun nativeGenerate(handle: Long, prompt: String, maxTokens: Int): String

    private external fun nativeClose(handle: Long)

    private external fun nativeLastStats(handle: Long): LongArray

    private external fun nativeCancel(handle: Long)

    private external fun nativeModelInfo(handle: Long): LongArray

    private external fun nativeBackendName(handle: Long): String

    companion object {
        private const val LIBRARY_NAME = "litertlm"

        @Volatile
        private var loadAttempted = false

        @Volatile
        private var libraryLoaded = false

        /** True when the native engine is present on this device. */
        val isAvailable: Boolean
            get() {
                if (!loadAttempted) {
                    synchronized(this) {
                        if (!loadAttempted) {
                            libraryLoaded = try {
                                System.loadLibrary(LIBRARY_NAME)
                                true
                            } catch (error: UnsatisfiedLinkError) {
                                false
                            }
                            loadAttempted = true
                        }
                    }
                }
                return libraryLoaded
            }

        /**
         * Opens a session for the model at [modelPath], or null when the engine
         * or the model file is unavailable.
         */
        fun open(context: Context, modelPath: String = DEFAULT_MODEL_FILE): LiteLLMInference? {
            if (!isAvailable) return null
            val file = java.io.File(context.filesDir, modelPath)
            if (!file.isFile) return null
            val handle = try {
                nativeOpen(file.absolutePath)
            } catch (error: UnsatisfiedLinkError) {
                return null
            }
            return if (handle == 0L) null else LiteLLMInference(handle, file.name)
        }

        private external fun nativeOpen(modelPath: String): Long

        /** Model file expected under the app's files directory. */
        const val DEFAULT_MODEL_FILE = "models/freehands.litertlm"
    }
}

/**
 * Cloud inference against an OpenAI-compatible chat completions endpoint.
 *
 * Used as the fallback route when the on-device model is absent or fails. The
 * endpoint and key come from build configuration; with neither set [fromConfig]
 * returns null so the agent reports that no route is available rather than
 * issuing an unauthenticated request.
 */
class OpenHandsCloudInference private constructor(
    private val baseUrl: String,
    private val apiKey: String,
    override val modelName: String,
    private val connectTimeoutMs: Int = DEFAULT_CONNECT_TIMEOUT_MS,
    private val readTimeoutMs: Int = DEFAULT_READ_TIMEOUT_MS,
) : CloudInference {

    override fun generate(prompt: String, maxTokens: Int): String {
        val body = JSONObject()
            .put("model", modelName)
            .put("max_tokens", maxTokens)
            .put(
                "messages",
                JSONArray().put(JSONObject().put("role", "user").put("content", prompt)),
            )
            .toString()
        val connection = (URL("$baseUrl/chat/completions").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $apiKey")
        }
        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            if (status !in 200..299) {
                throw InferenceUnavailableException("cloud inference failed with HTTP $status")
            }
            return parseContent(text)
        } finally {
            connection.disconnect()
        }
    }

    /** Extracts the assistant message, or throws when the reply is unusable. */
    fun parseContent(raw: String): String {
        val content = try {
            JSONObject(raw)
                .optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
        } catch (error: org.json.JSONException) {
            null
        }
        if (content.isNullOrBlank()) {
            throw InferenceUnavailableException("cloud inference returned no message")
        }
        return content
    }

    companion object {
        private const val DEFAULT_CONNECT_TIMEOUT_MS = 10_000
        private const val DEFAULT_READ_TIMEOUT_MS = 60_000

        /** Builds a client, or null when the endpoint or key is not configured. */
        fun fromConfig(baseUrl: String, apiKey: String, model: String): OpenHandsCloudInference? {
            if (baseUrl.isBlank() || apiKey.isBlank() || model.isBlank()) return null
            return OpenHandsCloudInference(baseUrl.trimEnd('/'), apiKey, model)
        }
    }
}


/**
 * Timings reported by the native engine for one generation.
 *
 * Decoding is tolerant on purpose: an older library that returns a shorter
 * array, or a handle that is no longer valid, yields zeroes rather than
 * throwing. A missing timing must not take down the agent loop.
 */
data class NativeInferenceStats(
    val promptTokens: Long,
    val generatedTokens: Long,
    val prefillMs: Long,
    val decodeMs: Long,
    val tokensPerSecond: Long,
    val kvEvictions: Long,
) {
    companion object {
        val EMPTY = NativeInferenceStats(0, 0, 0, 0, 0, 0)

        /** Field order matches the array the JNI bridge returns. */
        fun fromNative(values: LongArray?): NativeInferenceStats {
            if (values == null) return EMPTY
            fun at(index: Int): Long = if (index < values.size) values[index] else 0L
            return NativeInferenceStats(
                promptTokens = at(0),
                generatedTokens = at(1),
                prefillMs = at(2),
                decodeMs = at(3),
                tokensPerSecond = at(4),
                kvEvictions = at(5),
            )
        }
    }
}

/** Dimensions of the model the native engine currently holds. */
data class NativeModelInfo(
    val dModel: Int,
    val layers: Int,
    val vocabSize: Int,
    val maxContext: Int,
) {
    /** True when a model is actually loaded. */
    val isLoaded: Boolean get() = dModel > 0 && layers > 0

    companion object {
        val EMPTY = NativeModelInfo(0, 0, 0, 0)

        /** Field order matches the array the JNI bridge returns. */
        fun fromNative(values: LongArray?): NativeModelInfo {
            if (values == null) return EMPTY
            fun at(index: Int): Int = if (index < values.size) values[index].toInt() else 0
            return NativeModelInfo(
                dModel = at(0),
                layers = at(1),
                vocabSize = at(2),
                maxContext = at(3),
            )
        }
    }
}
