package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveFeedServerTest {

    private class FakeClient(override val id: String, private val accept: Boolean = true) : FeedClientConnection {
        val frames = mutableListOf<EncodedFrame>()
        var closed = false

        override fun sendFrame(frame: EncodedFrame): Boolean {
            if (!accept) return false
            frames += frame
            return true
        }

        override fun close() {
            closed = true
        }
    }

    private class FakeTransport : FeedTransport {
        private var onConnected: ((FeedClientConnection) -> Unit)? = null
        private var onDisconnected: ((String) -> Unit)? = null
        var running = false
            private set

        override fun start(
            onClientConnected: (FeedClientConnection) -> Unit,
            onClientDisconnected: (String) -> Unit,
        ) {
            onConnected = onClientConnected
            onDisconnected = onClientDisconnected
            running = true
        }

        override fun stop() {
            running = false
        }

        override fun isRunning(): Boolean = running

        fun connect(client: FeedClientConnection) = onConnected?.invoke(client)

        fun disconnect(id: String) = onDisconnected?.invoke(id)
    }

    private fun frame(sequence: Long) = EncodedFrame(
        data = byteArrayOf(1, 2, 3),
        sequence = sequence,
        captureTimestampUs = sequence * 1000,
        keyframe = sequence == 1L,
        width = 1080,
        height = 1920,
        bitrateKbps = 4000,
    )

    @Test
    fun `starts and stops the transport idempotently`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)

        server.start()
        server.start()
        assertTrue(server.isRunning)

        server.stop()
        server.stop()
        assertTrue(!server.isRunning)
    }

    @Test
    fun `broadcasts frames to every connected client`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)
        server.start()
        val first = FakeClient("a")
        val second = FakeClient("b")
        transport.connect(first)
        transport.connect(second)

        server.onFrame(frame(1))

        assertEquals(1, first.frames.size)
        assertEquals(1, second.frames.size)
        assertEquals(2L, server.broadcastFrames)
        assertEquals(0L, server.droppedFrames)
    }

    @Test
    fun `counts a slow client's frame as dropped without stalling others`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)
        server.start()
        val healthy = FakeClient("healthy")
        val slow = FakeClient("slow", accept = false)
        transport.connect(healthy)
        transport.connect(slow)

        val accepted = server.onFrame(frame(1))

        assertTrue(accepted)
        assertEquals(1, healthy.frames.size)
        assertEquals(1L, server.droppedFrames)
    }

    @Test
    fun `accepts frames with no viewers without counting a drop`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)
        server.start()

        assertTrue(server.onFrame(frame(1)))
        assertEquals(0L, server.broadcastFrames)
        assertEquals(0L, server.droppedFrames)
    }

    @Test
    fun `removes disconnected clients`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)
        server.start()
        val client = FakeClient("a")
        transport.connect(client)
        assertEquals(1, server.clientCount)

        transport.disconnect("a")

        assertEquals(0, server.clientCount)
    }

    @Test
    fun `closes clients when stopped`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)
        server.start()
        val client = FakeClient("a")
        transport.connect(client)

        server.stop()

        assertTrue(client.closed)
        assertEquals(0, server.clientCount)
    }

    @Test
    fun `records transmit latency and lowers quality under sustained load`() {
        var now = 0L
        val transport = FakeTransport()
        // Each clock read advances 200 ms, so one fan-out measures 200 ms.
        val server = LiveFeedServer(transport, clock = { now += 200_000_000L; now })
        server.start()
        transport.connect(FakeClient("a"))

        repeat(6) { server.onFrame(frame(it.toLong())) }

        assertTrue(server.latencySnapshot().stage(FeedStage.TRANSMIT) > 0)
        assertTrue(server.effectiveTier().index < QualityTier.HIGH.index)
    }

    @Test
    fun `applies the tier chosen by the native pipeline`() {
        val server = LiveFeedServer(FakeTransport())
        server.start()

        server.applyNativeTier(QualityTier.LOW)

        assertEquals(QualityTier.LOW, server.effectiveTier())
        assertEquals(QualityTier.LOW.settings, server.settings())
    }

    @Test
    fun `delivers every frame to the local observer with no clients`() {
        val server = LiveFeedServer(FakeTransport())
        val seen = mutableListOf<EncodedFrame>()
        server.setObserver { frame -> seen += frame; true }
        server.start()

        server.onFrame(frame(1))
        server.onFrame(frame(2))

        assertEquals(listOf(1L, 2L), seen.map { it.sequence })
    }

    @Test
    fun `an observer does not affect client fan-out accounting`() {
        val transport = FakeTransport()
        val server = LiveFeedServer(transport)
        server.setObserver { true }
        server.start()
        transport.connect(FakeClient("a"))

        server.onFrame(frame(1))

        assertEquals(1L, server.broadcastFrames)
        assertEquals(0L, server.droppedFrames)
    }
}
