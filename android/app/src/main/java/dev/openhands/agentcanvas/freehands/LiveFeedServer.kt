package dev.openhands.agentcanvas.freehands

/** One connected live-feed client. */
interface FeedClientConnection {
    val id: String

    /** Enqueues [frame] for this client. Returns false when the send buffer is full. */
    fun sendFrame(frame: EncodedFrame): Boolean

    fun close()
}

/** Accepts live-feed clients. Implemented by [WebSocketFeedTransport] and fakes. */
interface FeedTransport {
    fun start(
        onClientConnected: (FeedClientConnection) -> Unit,
        onClientDisconnected: (String) -> Unit,
    )

    fun stop()

    fun isRunning(): Boolean
}

/**
 * Fans encoded frames out to connected clients over a local WebSocket.
 *
 * The server is the transport half of the live feed: the native bridge produces
 * frames, this class delivers them. It is deliberately independent of the
 * WebSocket library so the fan-out, backpressure and latency accounting are
 * unit-testable against a fake transport.
 *
 * Backpressure: a client whose send buffer is full is skipped for that frame
 * and counted as a drop. Frames are never queued per client here, so one slow
 * client cannot stall the others or grow memory; it simply misses frames until
 * its buffer drains, which is the correct trade-off for a live feed.
 */
class LiveFeedServer(
    private val transport: FeedTransport,
    private val latencyBudget: LatencyBudget = LatencyBudget(),
    private val quality: AdaptiveQuality = AdaptiveQuality(),
    private val recorder: SessionRecorder? = null,
    private val clock: () -> Long = System::nanoTime,
) : FrameConsumer {

    private val lock = Any()
    private val clients = LinkedHashMap<String, FeedClientConnection>()
    private var started = false

    /**
     * Local consumer of every frame, independent of connected clients. The
     * in-app preview uses it so the user sees the feed even with no external
     * viewer connected.
     */
    @Volatile
    private var observer: FrameConsumer? = null

    private var framesBroadcast = 0L
    private var framesDropped = 0L

    val clientCount: Int get() = synchronized(lock) { clients.size }

    val isRunning: Boolean get() = transport.isRunning()

    val broadcastFrames: Long get() = synchronized(lock) { framesBroadcast }

    val droppedFrames: Long get() = synchronized(lock) { framesDropped }

    /** Starts accepting clients. Idempotent. */
    fun start() {
        synchronized(lock) {
            if (started) return
            started = true
        }
        transport.start(
            onClientConnected = { client -> addClient(client) },
            onClientDisconnected = { id -> removeClient(id) },
        )
        recorder?.record(SessionRecorder.EVENT_FEED_START)
    }

    /** Stops the transport and drops every client. Idempotent. */
    fun stop() {
        synchronized(lock) {
            if (!started) return
            started = false
            clients.values.forEach { it.close() }
            clients.clear()
        }
        transport.stop()
        recorder?.record(SessionRecorder.EVENT_FEED_STOP)
    }

    /** Registers the local consumer of every frame, replacing any previous one. */
    fun setObserver(observer: FrameConsumer?) {
        this.observer = observer
    }

    override fun onFrame(frame: EncodedFrame): Boolean {
        observer?.onFrame(frame)
        val snapshot = synchronized(lock) { clients.values.toList() }
        if (snapshot.isEmpty()) {
            // No viewer: report success so the bridge keeps streaming; the
            // frame is simply not delivered anywhere.
            return true
        }

        val startNs = clock()
        var delivered = 0
        var dropped = 0
        for (client in snapshot) {
            if (client.sendFrame(frame)) {
                delivered++
            } else {
                dropped++
            }
        }
        val elapsedMs = (clock() - startNs) / NANOS_PER_MILLI

        synchronized(lock) {
            framesBroadcast += delivered
            framesDropped += dropped
        }

        // Transmit latency is the wall time the fan-out took for this frame.
        latencyBudget.record(FeedStage.TRANSMIT, elapsedMs)
        quality.observeTransportLatency(elapsedMs)
        return delivered > 0
    }

    fun latencySnapshot(): LatencySnapshot = latencyBudget.snapshot()

    fun settings(): QualitySettings = quality.settings()

    fun effectiveTier(): QualityTier = quality.effectiveTier()

    /** Applies the tier chosen by the native capture pipeline. */
    fun applyNativeTier(tier: QualityTier) = quality.applyNativeTier(tier)

    private fun addClient(client: FeedClientConnection) {
        synchronized(lock) { clients[client.id] = client }
    }

    private fun removeClient(id: String) {
        synchronized(lock) { clients.remove(id) }
    }

    private companion object {
        const val NANOS_PER_MILLI = 1_000_000L
    }
}
