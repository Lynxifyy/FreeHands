package dev.openhands.agentcanvas.freehands

import java.io.BufferedOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Loopback HTTP endpoint that reports the health of the agent stack.
 *
 * The agent runs unattended, so a supervisor (the app itself, an automation, or
 * a developer with adb) needs a cheap way to ask "is everything still up?"
 * without driving the UI. `GET /healthz` returns the JSON report from
 * [HealthRegistry] with 200 when healthy and 503 when any component is down,
 * so the status code alone is a usable check.
 *
 * Bound to loopback for the same reason as the feed: the report names internal
 * components and must not be reachable from the network.
 *
 * Pass [port] 0 to bind an ephemeral port; read [boundPort] afterwards.
 */
class HealthCheckServer(
    private val registry: HealthRegistry,
    private val port: Int = DEFAULT_PORT,
    private val bindAddress: String = "127.0.0.1",
) {

    private val running = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private var acceptThread: Thread? = null

    val isRunning: Boolean get() = running.get()

    /** Port actually bound, or 0 when the server is stopped. */
    val boundPort: Int get() = serverSocket?.localPort ?: 0

    fun start() {
        if (!running.compareAndSet(false, true)) return
        val server = try {
            ServerSocket(port, BACKLOG, InetAddress.getByName(bindAddress))
        } catch (error: IOException) {
            running.set(false)
            throw IllegalStateException("Unable to bind health endpoint on $bindAddress:$port", error)
        }
        serverSocket = server
        acceptThread = thread(name = "freehands-health", isDaemon = true) {
            while (running.get()) {
                val socket = try {
                    server.accept()
                } catch (error: IOException) {
                    break
                }
                handle(socket)
            }
        }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        val server = serverSocket
        serverSocket = null
        acceptThread = null
        try {
            server?.close()
        } catch (error: IOException) {
            // Already closed.
        }
    }

    private fun handle(socket: Socket) {
        thread(name = "freehands-health-request", isDaemon = true) {
            try {
                socket.use { client ->
                    client.soTimeout = REQUEST_TIMEOUT_MS
                    val reader = client.getInputStream().bufferedReader(Charsets.ISO_8859_1)
                    val requestLine = reader.readLine().orEmpty()
                    val report = registry.report()
                    val body = report.toJson().toString().toByteArray(Charsets.UTF_8)
                    val status = if (report.healthy) "200 OK" else "503 Service Unavailable"
                    val response = buildString {
                        append("HTTP/1.1 $status\r\n")
                        append("Content-Type: application/json; charset=utf-8\r\n")
                        append("Content-Length: ${body.size}\r\n")
                        append("Connection: close\r\n")
                        append("\r\n")
                    }
                    val out = BufferedOutputStream(client.getOutputStream())
                    if (requestLine.startsWith("GET ")) {
                        out.write(response.toByteArray(Charsets.ISO_8859_1))
                        out.write(body)
                    } else {
                        out.write(
                            "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                                .toByteArray(Charsets.ISO_8859_1),
                        )
                    }
                    out.flush()
                }
            } catch (error: IOException) {
                // A dropped probe is not an error worth reporting.
            }
        }
    }

    companion object {
        const val DEFAULT_PORT = 8766
        private const val BACKLOG = 4
        private const val REQUEST_TIMEOUT_MS = 3000
    }
}
