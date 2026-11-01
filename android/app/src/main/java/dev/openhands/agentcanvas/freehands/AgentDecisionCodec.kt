package dev.openhands.agentcanvas.freehands

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** One observation of the device handed to the agent loop. */
data class AgentObservation(
    val timestampMs: Long,
    val sequence: Long,
    val screenWidth: Int,
    val screenHeight: Int,
    val focusedPackage: String?,
    val nodes: List<UiNode>,
    val visualDigest: ByteArray? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is AgentObservation) return false
        return timestampMs == other.timestampMs &&
            sequence == other.sequence &&
            screenWidth == other.screenWidth &&
            screenHeight == other.screenHeight &&
            focusedPackage == other.focusedPackage &&
            nodes == other.nodes &&
            visualDigest.contentEquals(other.visualDigest)
    }

    override fun hashCode(): Int {
        var result = timestampMs.hashCode()
        result = 31 * result + sequence.hashCode()
        result = 31 * result + screenWidth
        result = 31 * result + screenHeight
        result = 31 * result + (focusedPackage?.hashCode() ?: 0)
        result = 31 * result + nodes.hashCode()
        result = 31 * result + visualDigest.contentHashCode()
        return result
    }
}

/** What the agent wants to do next. */
data class AgentDecision(
    val thought: String,
    val action: AgentAction?,
    val done: Boolean = false,
)

/** A malformed decision from the agent loop. */
class AgentProtocolException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Encodes observations for, and decodes decisions from, the agent loop.
 *
 * The wire format is a small JSON contract shared with the SDK side. Keeping
 * encode and decode in one place means a change to the protocol is a change to
 * one file, and both directions are unit-testable without a server.
 */
object AgentDecisionCodec {

    fun encodeObservation(observation: AgentObservation): JSONObject {
        val nodeArray = JSONArray()
        observation.nodes.forEach { nodeArray.put(encodeNode(it)) }
        return JSONObject()
            .put("timestampMs", observation.timestampMs)
            .put("sequence", observation.sequence)
            .put("screenWidth", observation.screenWidth)
            .put("screenHeight", observation.screenHeight)
            .put("focusedPackage", observation.focusedPackage ?: JSONObject.NULL)
            .put("nodes", nodeArray)
            // The digest is a coarse brightness map, not an image: it is sent
            // as text so the model can compare two steps cheaply, and a step
            // that changed nothing is visible without a screenshot round trip.
            .put("visual", observation.visualDigest?.toString(Charsets.UTF_8) ?: JSONObject.NULL)
    }

    private fun encodeNode(node: UiNode): JSONObject = JSONObject()
        .put("id", node.id)
        .put("className", node.className)
        .put("text", node.text ?: JSONObject.NULL)
        .put("contentDescription", node.contentDescription ?: JSONObject.NULL)
        .put("clickable", node.clickable)
        .put("scrollable", node.scrollable)
        .put("editable", node.editable)
        .put("enabled", node.enabled)
        .put("focused", node.focused)
        .put("depth", node.depth)
        .put("bounds", JSONObject()
            .put("left", node.bounds.left)
            .put("top", node.bounds.top)
            .put("right", node.bounds.right)
            .put("bottom", node.bounds.bottom))

    /**
     * Decodes one decision. Throws [AgentProtocolException] when the payload is
     * unusable so the caller can apply its fallback policy rather than acting
     * on a half-parsed action.
     */
    fun decodeDecision(json: JSONObject): AgentDecision {
        val thought = json.optString("thought")
        val done = json.optBoolean("done", false)
        val actionJson = json.optJSONObject("action")
            ?: return AgentDecision(thought, action = null, done = done)
        return AgentDecision(thought, decodeAction(actionJson), done)
    }

    fun decodeDecision(raw: String): AgentDecision = try {
        decodeDecision(JSONObject(raw))
    } catch (error: JSONException) {
        throw AgentProtocolException("decision is not valid JSON", error)
    }

    private fun decodeAction(json: JSONObject): AgentAction {
        val type = json.optString("type")
        return try {
            when (type) {
                "tap" -> AgentAction.Tap(json.requiredInt("x"), json.requiredInt("y"))
                "tap_node" -> AgentAction.TapNode(
                    nodeId = json.getString("nodeId"),
                    label = json.optString("label").ifBlank { null },
                    bounds = decodeBounds(json.getJSONObject("bounds")),
                )
                "swipe" -> AgentAction.Swipe(
                    fromX = json.requiredInt("fromX"),
                    fromY = json.requiredInt("fromY"),
                    toX = json.requiredInt("toX"),
                    toY = json.requiredInt("toY"),
                    durationMs = json.optLong("durationMs", AgentAction.Swipe.DEFAULT_SWIPE_MS),
                )
                "type_text" -> AgentAction.TypeText(json.getString("text"))
                "back" -> AgentAction.Back
                "home" -> AgentAction.Home
                "scroll" -> AgentAction.Scroll(
                    nodeId = json.getString("nodeId"),
                    direction = decodeDirection(json.getString("direction")),
                )
                "wait" -> AgentAction.Wait(json.optLong("durationMs", 500L))
                "long_press" -> AgentAction.LongPress(
                    x = json.requiredInt("x"),
                    y = json.requiredInt("y"),
                    durationMs = json.optLong("durationMs", AgentAction.LongPress.DEFAULT_LONG_PRESS_MS),
                )
                else -> throw AgentProtocolException("unknown action type '$type'")
            }
        } catch (error: JSONException) {
            throw AgentProtocolException("malformed '$type' action", error)
        }
    }

    private fun decodeBounds(json: JSONObject): NodeBounds = NodeBounds(
        left = json.requiredInt("left"),
        top = json.requiredInt("top"),
        right = json.requiredInt("right"),
        bottom = json.requiredInt("bottom"),
    )

    private fun decodeDirection(raw: String): ScrollDirection = when (raw.lowercase()) {
        "forward" -> ScrollDirection.FORWARD
        "backward" -> ScrollDirection.BACKWARD
        "up" -> ScrollDirection.UP
        "down" -> ScrollDirection.DOWN
        "left" -> ScrollDirection.LEFT
        "right" -> ScrollDirection.RIGHT
        else -> throw AgentProtocolException("unknown scroll direction '$raw'")
    }

    private fun JSONObject.requiredInt(name: String): Int {
        if (!has(name) || isNull(name)) {
            throw JSONException("missing '$name'")
        }
        return getInt(name)
    }
}
