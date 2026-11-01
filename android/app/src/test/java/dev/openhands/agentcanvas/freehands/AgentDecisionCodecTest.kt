package dev.openhands.agentcanvas.freehands

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentDecisionCodecTest {

    @Test
    fun `decodes a tap`() {
        val decision = AgentDecisionCodec.decodeDecision(
            """{"thought":"tap the button","action":{"type":"tap","x":10,"y":20}}""",
        )

        assertEquals("tap the button", decision.thought)
        assertEquals(AgentAction.Tap(10, 20), decision.action)
    }

    @Test
    fun `decodes a tap on a node`() {
        val decision = AgentDecisionCodec.decodeDecision(
            """
            {"thought":"press","action":{"type":"tap_node","nodeId":"ok","label":"OK",
             "bounds":{"left":0,"top":0,"right":100,"bottom":50}}}
            """.trimIndent(),
        )

        val action = decision.action as AgentAction.TapNode
        assertEquals("ok", action.nodeId)
        assertEquals("OK", action.label)
        assertEquals(50, action.bounds.centerX)
        assertEquals(25, action.bounds.centerY)
    }

    @Test
    fun `decodes a swipe with a default duration`() {
        val decision = AgentDecisionCodec.decodeDecision(
            """{"action":{"type":"swipe","fromX":0,"fromY":0,"toX":0,"toY":500}}""",
        )

        val action = decision.action as AgentAction.Swipe
        assertEquals(0, action.fromX)
        assertEquals(500, action.toY)
        assertEquals(AgentAction.Swipe.DEFAULT_SWIPE_MS, action.durationMs)
    }

    @Test
    fun `decodes a scroll with a direction`() {
        val decision = AgentDecisionCodec.decodeDecision(
            """{"action":{"type":"scroll","nodeId":"list","direction":"DOWN"}}""",
        )

        val action = decision.action as AgentAction.Scroll
        assertEquals("list", action.nodeId)
        assertEquals(ScrollDirection.DOWN, action.direction)
    }

    @Test
    fun `decodes the simple actions`() {
        assertEquals(AgentAction.Back, AgentDecisionCodec.decodeDecision("""{"action":{"type":"back"}}""").action)
        assertEquals(AgentAction.Home, AgentDecisionCodec.decodeDecision("""{"action":{"type":"home"}}""").action)
        assertEquals(
            AgentAction.TypeText("hello"),
            AgentDecisionCodec.decodeDecision("""{"action":{"type":"type_text","text":"hello"}}""").action,
        )
    }

    @Test
    fun `decodes a completion with no action`() {
        val decision = AgentDecisionCodec.decodeDecision("""{"thought":"finished","done":true}""")

        assertTrue(decision.done)
        assertNull(decision.action)
    }

    @Test(expected = AgentProtocolException::class)
    fun `rejects a malformed payload`() {
        AgentDecisionCodec.decodeDecision("{not json")
    }

    @Test(expected = AgentProtocolException::class)
    fun `rejects an unknown action type`() {
        AgentDecisionCodec.decodeDecision("""{"action":{"type":"teleport"}}""")
    }

    @Test(expected = AgentProtocolException::class)
    fun `rejects a tap missing a coordinate`() {
        AgentDecisionCodec.decodeDecision("""{"action":{"type":"tap","x":1}}""")
    }

    @Test(expected = AgentProtocolException::class)
    fun `rejects an unknown scroll direction`() {
        AgentDecisionCodec.decodeDecision("""{"action":{"type":"scroll","nodeId":"a","direction":"sideways"}}""")
    }

    @Test
    fun `encodes an observation with nodes`() {
        val observation = AgentObservation(
            timestampMs = 1234,
            sequence = 7,
            screenWidth = 1080,
            screenHeight = 1920,
            focusedPackage = "com.example.app",
            nodes = listOf(
                UiNode(
                    id = "ok",
                    className = "android.widget.Button",
                    text = "OK",
                    contentDescription = null,
                    clickable = true,
                    scrollable = false,
                    editable = false,
                    enabled = true,
                    focused = false,
                    bounds = NodeBounds(0, 0, 100, 50),
                    depth = 1,
                ),
            ),
        )

        val json = AgentDecisionCodec.encodeObservation(observation)

        assertEquals(1234L, json.getLong("timestampMs"))
        assertEquals("com.example.app", json.getString("focusedPackage"))
        val node = json.getJSONArray("nodes").getJSONObject(0)
        assertEquals("ok", node.getString("id"))
        assertEquals(100, node.getJSONObject("bounds").getInt("right"))
    }

    @Test
    fun `encodes a null focused package explicitly`() {
        val json = AgentDecisionCodec.encodeObservation(
            AgentObservation(0, 0, 10, 10, null, emptyList()),
        )

        assertTrue(json.isNull("focusedPackage"))
    }

    @Test
    fun `round trips a decision through json`() {
        val raw = JSONObject()
            .put("thought", "go back")
            .put("action", JSONObject().put("type", "back"))

        val decision = AgentDecisionCodec.decodeDecision(raw.toString())

        assertEquals(AgentAction.Back, decision.action)
    }
}
