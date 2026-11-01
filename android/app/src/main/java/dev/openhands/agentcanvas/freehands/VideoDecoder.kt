package dev.openhands.agentcanvas.freehands

import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Decodes the H.264 stream onto a Surface for the live feed.
 *
 * The decoder runs asynchronously: [submit] queues an encoded frame and the
 * codec renders to the Surface on its own thread, so the capture path is never
 * blocked by decoding. Frames are dropped while the codec has no free input
 * buffer, because in a live feed the newest frame is the useful one; queueing
 * would only add latency.
 *
 * A codec that enters an error state is torn down and recreated on the next
 * keyframe: an H.264 decoder cannot recover mid-stream without one.
 */
class VideoDecoder(
    private val surface: Surface,
    private val onError: (String) -> Unit = {},
) : FrameConsumer {

    private val lock = Any()
    private var codec: MediaCodec? = null
    private var configuredWidth = 0
    private var configuredHeight = 0
    private var awaitingKeyframe = true
    private val released = AtomicBoolean(false)

    override fun onFrame(frame: EncodedFrame): Boolean = submit(frame)

    /** Queues [frame] for decoding. Returns false when it was skipped. */
    fun submit(frame: EncodedFrame): Boolean {
        if (released.get()) return false

        val active = synchronized(lock) {
            if (codec == null || frame.width != configuredWidth || frame.height != configuredHeight) {
                if (frame.width > 0 && frame.height > 0) {
                    startCodec(frame.width, frame.height) ?: return false
                } else {
                    return false
                }
            }
            codec
        } ?: return false

        if (awaitingKeyframe && !frame.keyframe) {
            return false
        }

        return try {
            val index = active.dequeueInputBuffer(INPUT_TIMEOUT_US)
            if (index < 0) {
                return false  // no free buffer; drop this frame
            }
            val buffer: ByteBuffer = active.getInputBuffer(index) ?: return false
            buffer.clear()
            buffer.put(frame.data)
            active.queueInputBuffer(index, 0, frame.data.size, frame.captureTimestampUs / 1000, 0)
            if (frame.keyframe) {
                awaitingKeyframe = false
            }
            true
        } catch (error: IllegalStateException) {
            onError("decoder rejected a frame: ${error.message.orEmpty()}")
            restart()
            false
        }
    }

    /** Releases the codec. Idempotent. */
    fun release() {
        if (!released.compareAndSet(false, true)) return
        val active = synchronized(lock) {
            val current = codec
            codec = null
            current
        }
        try {
            active?.stop()
        } catch (error: IllegalStateException) {
            // Not started; nothing to stop.
        }
        try {
            active?.release()
        } catch (error: IllegalStateException) {
            // Already released.
        }
    }

    private fun restart() {
        val active = synchronized(lock) {
            val current = codec
            codec = null
            awaitingKeyframe = true
            current
        }
        try {
            active?.release()
        } catch (error: IllegalStateException) {
            // Already released.
        }
    }

    private fun startCodec(width: Int, height: Int): MediaCodec? {
        return try {
            val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, MAX_INPUT_SIZE)
            }
            val created = MediaCodec.createDecoderByType(MIME_TYPE)
            created.setCallback(object : MediaCodec.Callback() {
                override fun onInputBufferAvailable(codec: MediaCodec, index: Int) = Unit

                override fun onOutputBufferAvailable(
                    codec: MediaCodec,
                    index: Int,
                    info: MediaCodec.BufferInfo,
                ) {
                    try {
                        codec.releaseOutputBuffer(index, true)
                    } catch (error: IllegalStateException) {
                        onError("failed to render a decoded frame: ${error.message.orEmpty()}")
                    }
                }

                override fun onError(codec: MediaCodec, error: MediaCodec.CodecException) {
                    onError("decoder error: ${error.diagnosticInfo.orEmpty()}")
                    restart()
                }

                override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) = Unit
            })
            created.configure(format, surface, null, 0)
            created.start()
            synchronized(lock) {
                codec = created
                configuredWidth = width
                configuredHeight = height
                awaitingKeyframe = true
            }
            created
        } catch (error: Exception) {
            onError("unable to start the decoder: ${error.message.orEmpty()}")
            null
        }
    }

    companion object {
        const val MIME_TYPE = "video/avc"
        private const val INPUT_TIMEOUT_US = 0L
        private const val MAX_INPUT_SIZE = 1024 * 1024
    }
}
