package dev.openhands.agentcanvas.freehands

import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Drives the live-feed transport with a real loopback socket rather than a
 * fake, so the handshake and the wire framing are exercised as a browser would
 * exercise them.
 */
class WebSocketFeedTransportTest {

    private class FeedClient(val socket: Socket) {
        private val input: InputStream = socket.getInputStream()
        private val output: OutputStream = socket.getOutputStream()

        fun sendUpgrade(key: String?, path: String = "/feed") {
            val keyHeader = if (key == null) "" else "Sec-WebSocket-Key: $key\r\n"
            output.write(
                (
                    "GET $path HTTP/1.1\r\n" +
                        "Host: 127.0.0.1\r\n" +
                        "Upgrade: websocket\r\n" +
                        "Connection: Upgrade\r\n" +
                        keyHeader +
                        "Sec-WebSocket-Version: 13\r\n" +
                        "\r\n"
                    ).toByteArray(Charsets.ISO_8859_1),
            )
            output.flush()
        }

        /** Reads the status line and headers, returning them as a list. */
        fun readResponseHead(): List<String> {
            val lines = mutableListOf<String>()
            while (true) {
                val line = readLine() ?: break
                lines += line
                if (line.isEmpty()) break
            }
            return lines
        }

        /** Reads one server-to-client frame and returns (opcode, payload). */
        fun readFrame(): Pair<Int, ByteArray> {
            val header = readExactly(2)
            val opcode = header[0].toInt() and 0x0F
            var length = (header[1].toInt() and 0x7F).toLong()
            if (length == 126L) {
                val extended = readExactly(2)
                length = ((extended[0].toInt() and 0xFF) shl 8 or (extended[1].toInt() and 0xFF)).toLong()
            } else if (length == 127L) {
                val extended = readExactly(8)
                length = 0
                extended.forEach { length = (length shl 8) or (it.toInt() and 0xFF).toLong() }
            }
            return opcode to if (length == 0L) ByteArray(0) else readExactly(length.toInt())
        }

        fun sendMaskedClose() {
            val mask = byteArrayOf(1, 2, 3, 4)
            output.write(0x88)
            output.write(0x80)
            output.write(mask)
            output.flush()
        }

        private fun readLine(): String? {
            val builder = StringBuilder()
            while (true) {
                val next = input.read()
                if (next < 0) return if (builder.isEmpty()) null else builder.toString()
                if (next == '\n'.code) return builder.toString().removeSuffix("\r")
                builder.append(next.toChar())
            }
        }

        private fun readExactly(length: Int): ByteArray {
            val buffer = ByteArray(length)
            var read = 0
            while (read < length) {
                val count = input.read(buffer, read, length - read)
                check(count >= 0) { "stream closed after $read of $length bytes" }
                read += count
            }
            return buffer
        }
    }

    private fun frame(sequence: Long, payload: ByteArray): EncodedFrame = EncodedFrame(
        data = payload,
        sequence = sequence,
        captureTimestampUs = sequence * 1000,
        keyframe = sequence == 0L,
        width = 1080,
        height = 1920,
        bitrateKbps = 4000,
    )

    @Test
    fun `accept token matches the rfc 6455 example`() {
        assertEquals(
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
            WebSocketFeedTransport.acceptToken("dGhlIHNhbXBsZSBub25jZQ=="),
        )
    }

    @Test
    fun `completes the handshake and streams frames`() {
        val connected = CountDownLatch(1)
        val server = WebSocketFeedTransport(port = 0, bindAddress = "127.0.0.1")
        val connection = AtomicReference<FeedClientConnection>()
        server.start(
            onClientConnected = {
                connection.set(it)
                connected.countDown()
            },
            onClientDisconnected = {},
        )
        assertTrue(server.boundPort > 0)

        val client = FeedClient(Socket(InetAddress.getByName("127.0.0.1"), server.boundPort))
        try {
            val key = "dGhlIHNhbXBsZSBub25jZQ=="
            client.sendUpgrade(key)
            val head = client.readResponseHead()

            assertEquals("HTTP/1.1 101 Switching Protocols", head.first())
            assertTrue(head.any { it == "Sec-WebSocket-Accept: ${WebSocketFeedTransport.acceptToken(key)}" })
            assertTrue(connected.await(2, TimeUnit.SECONDS))

            val payload = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8)
            assertTrue(connection.get().sendFrame(frame(0, payload)))
            val (opcode, received) = client.readFrame()

            assertEquals(0x2, opcode)
            assertTrue(payload.contentEquals(received))
        } finally {
            client.socket.close()
            server.stop()
        }
    }

    @Test
    fun `rejects a request without an upgrade key`() {
        val server = WebSocketFeedTransport(port = 0, bindAddress = "127.0.0.1")
        server.start(onClientConnected = {}, onClientDisconnected = {})

        val client = FeedClient(Socket(InetAddress.getByName("127.0.0.1"), server.boundPort))
        try {
            client.sendUpgrade(null)
            // The server drops the socket without answering, so the read hits EOF.
            assertTrue(client.readResponseHead().isEmpty())
            assertEquals(0, server.connectedClients)
        } finally {
            client.socket.close()
            server.stop()
        }
    }

    @Test
    fun `notices a client close and reports the disconnect`() {
        val connected = CountDownLatch(1)
        val disconnected = CountDownLatch(1)
        val server = WebSocketFeedTransport(port = 0, bindAddress = "127.0.0.1")
        server.start(
            onClientConnected = { connected.countDown() },
            onClientDisconnected = { disconnected.countDown() },
        )

        val client = FeedClient(Socket(InetAddress.getByName("127.0.0.1"), server.boundPort))
        try {
            client.sendUpgrade("dGhlIHNhbXBsZSBub25jZQ==")
            client.readResponseHead()
            assertTrue(connected.await(2, TimeUnit.SECONDS))

            client.sendMaskedClose()

            assertTrue(disconnected.await(2, TimeUnit.SECONDS))
            assertEquals(0, server.connectedClients)
        } finally {
            client.socket.close()
            server.stop()
        }
    }

    @Test
    fun `stop releases the port and is idempotent`() {
        val server = WebSocketFeedTransport(port = 0, bindAddress = "127.0.0.1")
        server.start(onClientConnected = {}, onClientDisconnected = {})
        assertTrue(server.isRunning())
        assertTrue(server.boundPort > 0)

        server.stop()
        assertFalse(server.isRunning())
        assertEquals(0, server.boundPort)
        server.stop()
        assertFalse(server.isRunning())
    }
}
