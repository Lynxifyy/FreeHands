package dev.openhands.agentcanvas.freehands

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionRecorderTest {

    private fun tempDir(): File = Files.createTempDirectory("freehands-recorder").toFile()

    @Test
    fun `records actions and reads them back`() {
        val dir = tempDir()
        val recorder = SessionRecorder(dir, clock = { 1000L }, sessionId = "s1")

        recorder.recordAction(AgentAction.Tap(1, 2), ActionResult.Success)
        recorder.recordAction(AgentAction.TypeText("x"), ActionResult.Denied("not allowed"))

        val events = recorder.readAll()
        assertEquals(2, events.size)
        assertEquals("action", events[0].type)
        assertEquals("Tap (1, 2)", events[0].detail.getString("action"))
        assertEquals("Success", events[0].detail.getString("result"))
        assertEquals("not allowed", events[1].detail.getString("reason"))
        assertEquals(2, recorder.recordedEvents)
    }

    @Test
    fun `writes one json object per line`() {
        val dir = tempDir()
        val recorder = SessionRecorder(dir, clock = { 5L }, sessionId = "s2")
        recorder.record(SessionRecorder.EVENT_SERVICE_START)

        val file = File(dir, "s2.jsonl")
        assertTrue(file.exists())
        val lines = file.readLines().filter { it.isNotBlank() }
        assertEquals(1, lines.size)
        assertTrue(lines[0].startsWith("{"))
    }

    @Test
    fun `skips malformed lines when reading`() {
        val dir = tempDir()
        val file = File(dir, "s3.jsonl")
        file.writeText("{not json\n" + """{"timestampMs":1,"type":"ok","detail":{}}""" + "\n")

        val recorder = SessionRecorder(dir, sessionId = "s3")
        val events = recorder.readAll()

        assertEquals(1, events.size)
        assertEquals("ok", events[0].type)
    }

    @Test
    fun `survives a non writable directory without throwing`() {
        val dir = File(tempDir(), "readonly")
        dir.mkdirs()
        dir.setWritable(false)
        val recorder = SessionRecorder(dir, sessionId = "s4")

        recorder.recordAction(AgentAction.Back, ActionResult.Success)

        assertEquals(0, recorder.recordedEvents)
        dir.setWritable(true)
    }

    @Test
    fun `reports a stable default session id`() {
        assertEquals("session-42", SessionRecorder.defaultSessionId(42L))
    }

    @Test
    fun `serialises events to a json array`() {
        val dir = tempDir()
        val recorder = SessionRecorder(dir, clock = { 1L }, sessionId = "s5")
        recorder.recordAction(AgentAction.Back, ActionResult.Success)

        val array = SessionRecorder.toJsonArray(recorder.readAll())

        assertEquals(1, array.length())
        assertEquals("action", array.getJSONObject(0).getString("type"))
    }

    @Test
    fun `reads back an empty list before any write`() {
        val recorder = SessionRecorder(tempDir(), sessionId = "s6")

        assertTrue(recorder.readAll().isEmpty())
    }
}
