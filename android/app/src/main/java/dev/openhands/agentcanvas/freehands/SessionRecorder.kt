package dev.openhands.agentcanvas.freehands

import java.io.File
import java.io.IOException
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** One recorded event in an agent session. */
data class SessionEvent(
    val timestampMs: Long,
    val type: String,
    val detail: JSONObject,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("timestampMs", timestampMs)
        .put("type", type)
        .put("detail", detail)
}

/**
 * Records agent sessions to a JSON-lines file for debugging and replay.
 *
 * Every action, its result, and significant lifecycle transitions are appended
 * as one JSON object per line. JSONL is used deliberately: a session killed
 * mid-write still leaves every previously flushed line parseable, which is
 * exactly the situation a crash report comes from.
 *
 * Writes are synchronised and the file handle is opened lazily so a recorder
 * can be constructed before the storage directory exists.
 */
class SessionRecorder(
    private val directory: File,
    private val clock: () -> Long = System::currentTimeMillis,
    private val sessionId: String = defaultSessionId(clock()),
) : AutoCloseable {

    private val lock = Any()
    private var file: File? = null
    private var eventCount = 0

    val path: String? get() = synchronized(lock) { file?.absolutePath }

    val recordedEvents: Int get() = synchronized(lock) { eventCount }

    /** Records one action and its outcome. */
    fun recordAction(action: AgentAction, result: ActionResult) {
        val detail = JSONObject()
            .put("action", action.description)
            .put("actionType", action::class.simpleName ?: "Unknown")
            .put("result", result::class.simpleName ?: "Unknown")
        when (result) {
            is ActionResult.Denied -> detail.put("reason", result.reason)
            is ActionResult.Failed -> detail.put("reason", result.reason)
            ActionResult.Success -> Unit
        }
        record("action", detail)
    }

    /** Records a named lifecycle event with optional structured detail. */
    fun record(type: String, detail: JSONObject = JSONObject()) {
        synchronized(lock) {
            val target = ensureFile() ?: return
            val event = SessionEvent(clock(), type, detail)
            try {
                target.appendText(event.toJson().toString() + "\n")
                eventCount++
            } catch (error: IOException) {
                // Recording must never break the agent; a failed write is
                // surfaced through eventCount only.
            }
        }
    }

    /**
     * Reads back every well-formed event. Malformed lines are skipped.
     *
     * Resolves the path from the session id rather than waiting for a write, so
     * a fresh process can replay a session recorded by an earlier run.
     */
    fun readAll(): List<SessionEvent> {
        val source = synchronized(lock) { file } ?: fileFor()
        if (!source.exists()) return emptyList()
        return source.readLines().mapNotNull { line ->
            if (line.isBlank()) return@mapNotNull null
            try {
                val json = JSONObject(line)
                SessionEvent(
                    timestampMs = json.optLong("timestampMs"),
                    type = json.optString("type"),
                    detail = json.optJSONObject("detail") ?: JSONObject(),
                )
            } catch (error: JSONException) {
                null
            }
        }
    }

    override fun close() {
        synchronized(lock) {
            file = null
        }
    }

    private fun fileFor(): File = File(directory, "$sessionId.jsonl")

    private fun ensureFile(): File? {
        file?.let { return it }
        if (!directory.exists() && !directory.mkdirs()) {
            return null
        }
        val target = fileFor()
        if (!target.exists()) {
            try {
                if (!target.createNewFile()) {
                    return null
                }
            } catch (error: IOException) {
                return null
            }
        }
        file = target
        return target
    }

    companion object {
        const val EVENT_ACTION = "action"
        const val EVENT_SERVICE_START = "service_start"
        const val EVENT_SERVICE_STOP = "service_stop"
        const val EVENT_FEED_START = "feed_start"
        const val EVENT_FEED_STOP = "feed_stop"
        const val EVENT_ERROR = "error"

        fun defaultSessionId(timestampMs: Long): String = "session-$timestampMs"

        /** Serialises an arbitrary list of events, used by replay tooling. */
        fun toJsonArray(events: List<SessionEvent>): JSONArray = JSONArray().apply {
            events.forEach { put(it.toJson()) }
        }
    }
}
