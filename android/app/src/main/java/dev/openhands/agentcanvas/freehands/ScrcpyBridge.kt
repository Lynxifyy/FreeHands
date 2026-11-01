package dev.openhands.agentcanvas.freehands

/** One encoded frame delivered by the native capture pipeline. */
data class EncodedFrame(
    val data: ByteArray,
    val sequence: Long,
    val captureTimestampUs: Long,
    val keyframe: Boolean,
    val width: Int,
    val height: Int,
    val bitrateKbps: Int,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is EncodedFrame) return false
        return sequence == other.sequence &&
            captureTimestampUs == other.captureTimestampUs &&
            keyframe == other.keyframe &&
            width == other.width &&
            height == other.height &&
            bitrateKbps == other.bitrateKbps &&
            data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = data.contentHashCode()
        result = 31 * result + sequence.hashCode()
        result = 31 * result + captureTimestampUs.hashCode()
        result = 31 * result + keyframe.hashCode()
        result = 31 * result + width
        result = 31 * result + height
        result = 31 * result + bitrateKbps
        return result
    }
}

/** Consumer of encoded frames; implemented by the live-feed server. */
fun interface FrameConsumer {
    /** Returns true when the frame was accepted. */
    fun onFrame(frame: EncodedFrame): Boolean
}

/**
 * Kotlin wrapper around the native Scrcpy capture pipeline.
 *
 * Every native call is guarded: when the shared library is missing (for
 * example on the JVM unit-test classpath, or on a device where the ABI was not
 * packaged) the wrapper reports [isAvailable] as false and the calls become
 * no-ops instead of throwing. The UI uses [isAvailable] to explain why the
 * live feed cannot start rather than crashing.
 */
class ScrcpyBridge(
    width: Int = DEFAULT_WIDTH,
    height: Int = DEFAULT_HEIGHT,
    fps: Int = DEFAULT_FPS,
    bitrateKbps: Int = DEFAULT_BITRATE_KBPS,
    latencyBudgetMs: Long = LatencyBudget.DEFAULT_BUDGET_MS,
    queueCapacity: Int = DEFAULT_QUEUE_CAPACITY,
) : AutoCloseable {

    private var handle: Long = 0L
    private var consumer: FrameConsumer? = null

    /** Handle allocated by the native registry, or 0 when the bridge is closed. */
    val nativeHandle: Long get() = handle

    init {
        if (isAvailable) {
            handle = nativeCreate(width, height, fps, bitrateKbps, latencyBudgetMs, queueCapacity)
        }
    }

    /** Starts the native capture thread. Returns false when unavailable. */
    fun start(): Boolean = handle != 0L && nativeStart(handle)

    /** Stops the native capture thread. Idempotent and safe when unavailable. */
    fun stop() {
        if (handle != 0L) {
            nativeStop(handle)
        }
    }

    fun isRunning(): Boolean = handle != 0L && nativeIsRunning(handle)

    /**
     * Registers the frame consumer. Must be called before [start] to avoid
     * dropping the first frames; replacing an existing consumer is allowed.
     */
    fun setConsumer(consumer: FrameConsumer?) {
        this.consumer = consumer
        if (handle != 0L) {
            nativeSetSink(handle, consumer)
        }
    }

    /** Feeds one discrete encoded frame from the Android encoder. */
    fun pushFrame(
        data: ByteArray,
        captureTimestampUs: Long,
        keyframe: Boolean,
        width: Int,
        height: Int,
    ): Boolean {
        if (handle == 0L || data.isEmpty()) return false
        return nativePushFrame(handle, data, captureTimestampUs, keyframe, width, height)
    }

    /** Feeds a raw Annex-B byte chunk, as delivered by the scrcpy socket, and
     * returns the number of frames the native parser completed. */
    fun pushEncodedChunk(data: ByteArray, captureTimestampUs: Long): Int {
        if (handle == 0L || data.isEmpty()) return 0
        return nativePushEncodedChunk(handle, data, captureTimestampUs)
    }

    fun recordStage(stage: FeedStage, durationMs: Long) {
        if (handle != 0L) {
            nativeRecordStage(handle, stage.index, durationMs)
        }
    }

    fun latencyStats(): LongArray =
        if (handle == 0L) LongArray(9) else nativeLatencyStats(handle)

    fun qualitySettings(): IntArray =
        if (handle == 0L) intArrayOf(DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_BITRATE_KBPS, DEFAULT_FPS)
        else nativeQualitySettings(handle)

    fun droppedFrames(): Long = if (handle == 0L) 0L else nativeDroppedFrames(handle)

    fun framesCaptured(): Long = if (handle == 0L) 0L else nativeFramesCaptured(handle)

    fun lastError(): String = if (handle == 0L) "" else nativeLastError(handle) ?: ""

    override fun close() {
        stop()
        if (handle != 0L) {
            nativeDestroy(handle)
            handle = 0L
        }
        consumer = null
    }

    /** Invoked from the native capture thread; must not block for long. */
    @Suppress("unused")
    private fun onFrame(
        data: ByteArray,
        sequence: Long,
        captureTimestampUs: Long,
        keyframe: Boolean,
        width: Int,
        height: Int,
        bitrateKbps: Int,
    ): Boolean {
        val target = consumer ?: return false
        return target.onFrame(
            EncodedFrame(data, sequence, captureTimestampUs, keyframe, width, height, bitrateKbps),
        )
    }

    private external fun nativeCreate(
        width: Int,
        height: Int,
        fps: Int,
        bitrateKbps: Int,
        latencyBudgetMs: Long,
        queueCapacity: Int,
    ): Long

    private external fun nativeDestroy(handle: Long)

    private external fun nativeStart(handle: Long): Boolean

    private external fun nativeStop(handle: Long)

    private external fun nativeIsRunning(handle: Long): Boolean

    private external fun nativeSetSink(handle: Long, consumer: FrameConsumer?): Boolean

    private external fun nativePushFrame(
        handle: Long,
        data: ByteArray,
        captureTimestampUs: Long,
        keyframe: Boolean,
        width: Int,
        height: Int,
    ): Boolean

    private external fun nativePushEncodedChunk(handle: Long, data: ByteArray, captureTimestampUs: Long): Int

    private external fun nativeRecordStage(handle: Long, stage: Int, durationMs: Long)

    private external fun nativeLatencyStats(handle: Long): LongArray

    private external fun nativeQualitySettings(handle: Long): IntArray

    private external fun nativeDroppedFrames(handle: Long): Long

    private external fun nativeFramesCaptured(handle: Long): Long

    private external fun nativeLastError(handle: Long): String

    companion object {
        const val DEFAULT_WIDTH = 1080
        const val DEFAULT_HEIGHT = 1920
        const val DEFAULT_FPS = 12
        const val DEFAULT_BITRATE_KBPS = 4000
        const val DEFAULT_QUEUE_CAPACITY = 8

        private const val LIBRARY_NAME = "freehands_bridge"

        /** True when the native library loaded and the bridge can be used. */
        @JvmStatic
        val isAvailable: Boolean = try {
            System.loadLibrary(LIBRARY_NAME)
            true
        } catch (error: UnsatisfiedLinkError) {
            false
        }
    }
}
