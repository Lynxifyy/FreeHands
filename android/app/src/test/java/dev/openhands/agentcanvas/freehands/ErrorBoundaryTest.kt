package dev.openhands.agentcanvas.freehands

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorBoundaryTest {

    private class RecordingHandler : Thread.UncaughtExceptionHandler {
        val seen = mutableListOf<Throwable>()

        override fun uncaughtException(thread: Thread, throwable: Throwable) {
            seen += throwable
        }
    }

    @Test
    fun `restarts the agent on a crash`() {
        val restarts = AtomicInteger()
        val boundary = ErrorBoundary(restart = { restarts.incrementAndGet() }, previous = null)

        boundary.uncaughtException(Thread.currentThread(), RuntimeException("boom"))

        assertEquals(1, restarts.get())
        assertEquals(1, boundary.crashCount)
        assertEquals(1, boundary.restartCount)
    }

    @Test
    fun `propagates to the previous handler once the restart budget is spent`() {
        val restarts = AtomicInteger()
        val previous = RecordingHandler()
        val boundary = ErrorBoundary(
            restart = { restarts.incrementAndGet() },
            previous = previous,
            maxRestarts = 2,
            restartWindowMs = 60_000,
            clock = { 0L },
        )

        repeat(3) { boundary.uncaughtException(Thread.currentThread(), RuntimeException("boom $it")) }

        assertEquals(2, restarts.get())
        assertEquals(1, previous.seen.size)
    }

    @Test
    fun `frees the budget as the window slides`() {
        var now = 0L
        val restarts = AtomicInteger()
        val previous = RecordingHandler()
        val boundary = ErrorBoundary(
            restart = { restarts.incrementAndGet() },
            previous = previous,
            maxRestarts = 1,
            restartWindowMs = 1000,
            clock = { now },
        )

        boundary.uncaughtException(Thread.currentThread(), RuntimeException("first"))
        boundary.uncaughtException(Thread.currentThread(), RuntimeException("second"))
        assertEquals(1, restarts.get())
        assertEquals(1, previous.seen.size)

        now = 2000
        boundary.uncaughtException(Thread.currentThread(), RuntimeException("third"))

        assertEquals(2, restarts.get())
        assertEquals(1, previous.seen.size)
    }

    @Test
    fun `propagates when the restart itself fails`() {
        val previous = RecordingHandler()
        val boundary = ErrorBoundary(
            restart = { throw IllegalStateException("cannot restart") },
            previous = previous,
        )

        boundary.uncaughtException(Thread.currentThread(), RuntimeException("boom"))

        assertEquals(1, previous.seen.size)
        assertEquals(0, boundary.restartCount)
    }

    @Test
    fun `records crashes and restarts`() {
        val dir = java.nio.file.Files.createTempDirectory("freehands-boundary").toFile()
        val recorder = SessionRecorder(dir, clock = { 1L }, sessionId = "boundary")
        val boundary = ErrorBoundary(restart = {}, previous = null, recorder = recorder)

        boundary.uncaughtException(Thread.currentThread(), RuntimeException("boom"))

        val events = recorder.readAll()
        assertEquals(1, events.size)
        assertEquals(SessionRecorder.EVENT_ERROR, events[0].type)
        assertTrue(events[0].detail.getBoolean("restarting"))
    }

    @Test
    fun `install and uninstall swap the default handler`() {
        val original = Thread.getDefaultUncaughtExceptionHandler()
        val boundary = ErrorBoundary(restart = {}, previous = null)
        try {
            boundary.install()
            assertTrue(Thread.getDefaultUncaughtExceptionHandler() === boundary)

            boundary.uninstall()
            assertFalse(Thread.getDefaultUncaughtExceptionHandler() === boundary)
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(original)
        }
    }
}
