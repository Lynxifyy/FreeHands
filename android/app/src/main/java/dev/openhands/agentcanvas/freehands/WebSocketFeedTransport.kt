package dev.openhands.agentcanvas.freehands

import java.io.BufferedOutputStream
import java.io.IOException
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Minimal RFC 6455 WebSocket server for the live feed.
 *
 * The feed sends one binary frame per WebSocket message and never receives
 * application data, so the full protocol is unnecessary: the server performs
 * the HTTP upgrade handshake, then writes binary frames. Text frames and
 * control frames from the client are parsed only far enough to detect a close
 * or ping; anything else is ignored.
 *
 * The server binds to the loopback interface by default. The live feed exposes
 * the device screen, so binding to 0.0.0.0 would let any host on the network
 * watch it; a caller that needs remote access must opt in explicitly.
 */
class WebSocketFeedTransport(
    private val port: Int = DEFAULT_PORT,
    private val bindAddress: String = "127.0.0.1",
    private val handshakeTimeoutMs: Int = DEFAULT_HANDSHAKE_TIMEOUT_MS,
) : FeedTransport {

    private val running = AtomicBoolean(false)
    private val clients = ConcurrentHashMap<String, ClientConnection>()

    private var serverSocket: ServerSocket? = null
    private var acceptThread: Thread? = null
    private var nextClientId = 0

    override fun isRunning(): Boolean = running.get()

    /** Port actually bound, or 0 when the server is stopped. */
    val boundPort: Int get() = serverSocket?.localPort ?: 0

    /** Number of clients that completed the handshake and are still attached. */
    val connectedClients: Int get() = clients.size

    override fun start(
        onClientConnected: (FeedClientConnection) -> Unit,
        onClientDisconnected: (String) -> Unit,
    ) {
        if (!running.compareAndSet(false, true)) return

        val server = try {
            ServerSocket(port, BACKLOG, java.net.InetAddress.getByName(bindAddress))
        } catch (error: IOException) {
            running.set(false)
            throw IllegalStateException("Unable to bind live feed server on $bindAddress:$port", error)
        }
        serverSocket = server

        acceptThread = thread(name = "freehands-feed-accept", isDaemon = true) {
            while (running.get()) {
                val socket = try {
                    server.accept()
                } catch (error: IOException) {
                    break  // socket closed by stop()
                }
                handleSocket(socket, onClientConnected, onClientDisconnected)
            }
        }
    }

    override fun stop() {
        if (!running.compareAndSet(true, false)) return
        clients.values.forEach { it.close() }
        clients.clear()
        try {
            serverSocket?.close()
        } catch (error: IOException) {
            // Closing an already-closed socket is fine.
        }
        serverSocket = null
        acceptThread = null
    }

    private fun handleSocket(
        socket: Socket,
        onClientConnected: (FeedClientConnection) -> Unit,
        onClientDisconnected: (String) -> Unit,
    ) {
        thread(name = "freehands-feed-handshake", isDaemon = true) {
            val connection = try {
                performHandshake(socket)
            } catch (error: IOException) {
                closeQuietly(socket)
                return@thread
            } ?: run {
                closeQuietly(socket)
                return@thread
            }

            val id = "client-${nextClientId++}"
            val client = ClientConnection(id, socket, connection.output)
            clients[id] = client
            onClientConnected(client)

            // Drain client control frames so a close is noticed promptly.
            try {
                client.pumpInput()
            } catch (error: IOException) {
                // Fall through to disconnect.
            } finally {
                clients.remove(id)
                client.close()
                onClientDisconnected(id)
            }
        }
    }

    private class HandshakeResult(val output: BufferedOutputStream)

    private fun performHandshake(socket: Socket): HandshakeResult? {
        socket.soTimeout = handshakeTimeoutMs
        val input = socket.getInputStream().bufferedReader(Charsets.ISO_8859_1)
        val requestLine = input.readLine() ?: return null
        if (!requestLine.startsWith("GET ")) {
            return null
        }
        var key: String? = null
        while (true) {
            val line = input.readLine() ?: break
            if (line.isEmpty()) break
            val separator = line.indexOf(':')
            if (separator <= 0) continue
            val name = line.substring(0, separator).trim()
            val value = line.substring(separator + 1).trim()
            if (name.equals("Sec-WebSocket-Key", ignoreCase = true)) {
                key = value
            }
        }
        if (key == null) {
            return null
        }

        val accept = acceptToken(key)

        val response = buildString {
            append("HTTP/1.1 101 Switching Protocols\r\n")
            append("Upgrade: websocket\r\n")
            append("Connection: Upgrade\r\n")
            append("Sec-WebSocket-Accept: $accept\r\n")
            append("\r\n")
        }
        val raw = socket.getOutputStream()
        raw.write(response.toByteArray(Charsets.ISO_8859_1))
        raw.flush()
        socket.soTimeout = 0
        return HandshakeResult(BufferedOutputStream(raw, SEND_BUFFER_BYTES))
    }

    private class ClientConnection(
        override val id: String,
        private val socket: Socket,
        private val output: BufferedOutputStream,
    ) : FeedClientConnection {

        private val closed = AtomicBoolean(false)

        @Volatile
        private var clientClosing = false

        override fun sendFrame(frame: EncodedFrame): Boolean {
            if (closed.get() || clientClosing) return false
            return try {
                synchronized(output) {
                    writeFrame(output, OPCODE_BINARY, frame.data)
                    output.flush()
                }
                true
            } catch (error: IOException) {
                close()
                false
            }
        }

        override fun close() {
            if (!closed.compareAndSet(false, true)) return
            closeQuietly(socket)
        }

        /** Reads and discards client frames until close or EOF. */
        fun pumpInput() {
            val input = socket.getInputStream()
            val header = ByteArray(2)
            while (!closed.get()) {
                if (!readFully(input, header, 2)) break
                val opcode = header[0].toInt() and 0x0F
                val masked = header[1].toInt() and 0x80 != 0
                var length = (header[1].toInt() and 0x7F).toLong()
                if (length == 126L) {
                    val extended = ByteArray(2)
                    if (!readFully(input, extended, 2)) break
                    length = ((extended[0].toInt() and 0xFF) shl 8 or (extended[1].toInt() and 0xFF)).toLong()
                } else if (length == 127L) {
                    val extended = ByteArray(8)
                    if (!readFully(input, extended, 8)) break
                    length = 0
                    extended.forEach { length = (length shl 8) or (it.toInt() and 0xFF).toLong() }
                }
                val mask = if (masked) ByteArray(4).also { if (!readFully(input, it, 4)) return } else null
                val payload = if (length > 0) ByteArray(length.toInt()).also { if (!readFully(input, it, it.size)) return } else ByteArray(0)
                if (mask != null) {
                    payload.indices.forEach { payload[it] = (payload[it].toInt() xor mask[it % 4].toInt()).toByte() }
                }
                when (opcode) {
                    OPCODE_CLOSE -> {
                        clientClosing = true
                        return
                    }
                    OPCODE_PING -> synchronized(output) {
                        writeFrame(output, OPCODE_PONG, payload)
                        output.flush()
                    }
                    else -> Unit  // the feed is one-directional
                }
            }
        }

        private fun readFully(input: java.io.InputStream, buffer: ByteArray, length: Int): Boolean {
            var read = 0
            while (read < length) {
                val count = input.read(buffer, read, length - read)
                if (count < 0) return false
                read += count
            }
            return true
        }
    }

    companion object {
        const val DEFAULT_PORT = 8765
        const val DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000
        private const val BACKLOG = 8
        private const val SEND_BUFFER_BYTES = 64 * 1024
        private const val WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        private const val OPCODE_CLOSE = 0x8
        private const val OPCODE_PING = 0x9
        private const val OPCODE_PONG = 0xA
        private const val OPCODE_BINARY = 0x2

        private const val BASE64_ALPHABET =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

        /**
         * Standard base64, used for the handshake accept token.
         *
         * Hand-rolled because `java.util.Base64` needs API 26 and the app
         * supports API 23; the Android `android.util.Base64` equivalent is not
         * available to the JVM unit tests.
         */
        internal fun base64(bytes: ByteArray): String {
            val out = StringBuilder((bytes.size + 2) / 3 * 4)
            var index = 0
            while (index + 3 <= bytes.size) {
                val chunk = (bytes[index].toInt() and 0xFF shl 16) or
                    (bytes[index + 1].toInt() and 0xFF shl 8) or
                    (bytes[index + 2].toInt() and 0xFF)
                out.append(BASE64_ALPHABET[chunk shr 18 and 0x3F])
                out.append(BASE64_ALPHABET[chunk shr 12 and 0x3F])
                out.append(BASE64_ALPHABET[chunk shr 6 and 0x3F])
                out.append(BASE64_ALPHABET[chunk and 0x3F])
                index += 3
            }
            when (bytes.size - index) {
                1 -> {
                    val chunk = bytes[index].toInt() and 0xFF shl 16
                    out.append(BASE64_ALPHABET[chunk shr 18 and 0x3F])
                    out.append(BASE64_ALPHABET[chunk shr 12 and 0x3F])
                    out.append("==")
                }
                2 -> {
                    val chunk = (bytes[index].toInt() and 0xFF shl 16) or
                        (bytes[index + 1].toInt() and 0xFF shl 8)
                    out.append(BASE64_ALPHABET[chunk shr 18 and 0x3F])
                    out.append(BASE64_ALPHABET[chunk shr 12 and 0x3F])
                    out.append(BASE64_ALPHABET[chunk shr 6 and 0x3F])
                    out.append('=')
                }
            }
            return out.toString()
        }

        /** RFC 6455 accept token for a client key. */
        internal fun acceptToken(clientKey: String): String = base64(
            MessageDigest.getInstance("SHA-1")
                .digest((clientKey + WEBSOCKET_GUID).toByteArray(Charsets.ISO_8859_1)),
        )

        /** Writes one unmasked, server-to-client WebSocket frame. */
        internal fun writeFrame(output: java.io.OutputStream, opcode: Int, payload: ByteArray) {
            output.write(0x80 or opcode)
            val length = payload.size
            when {
                length < 126 -> output.write(length)
                length <= 0xFFFF -> {
                    output.write(126)
                    output.write((length shr 8) and 0xFF)
                    output.write(length and 0xFF)
                }
                else -> {
                    output.write(127)
                    for (shift in 56 downTo 0 step 8) {
                        output.write((length.toLong() shr shift and 0xFF).toInt())
                    }
                }
            }
            output.write(payload)
        }
    }
}

private fun closeQuietly(socket: Socket) {
    try {
        socket.close()
    } catch (error: IOException) {
        // Already closed.
    }
}
