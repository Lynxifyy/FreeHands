package dev.openhands.agentcanvas.freehands

import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import java.nio.ByteBuffer

/**
 * Captures the screen, encodes it to H.264 and feeds the native bridge.
 *
 * One virtual display mirrors the screen into the encoder's input surface, so
 * the encode path is pure hardware: no pixel reaches the CPU on the way to the
 * feed. Android 14+ grants a single `createVirtualDisplay` per consent, so the
 * luma frames the verifier needs are tapped from the decoder's output instead
 * of from a second display (see [VideoDecoder]'s frame callback).
 *
 * Failure handling: a codec that cannot be created or a display that cannot be
 * made reports through [onError] and [start] returns false, so the service can
 * tell the user which piece is missing instead of streaming nothing.
 */
class ScreenCaptureSource(
    private val pipeline: CapturePipeline,
    private val settings: CaptureSettings,
    private val screenDensity: Int,
    private val onError: (String) -> Unit = {},
) {

    private var projection: MediaProjection? = null
    private var encoderDisplay: VirtualDisplay? = null
    private var codec: MediaCodec? = null

    private val encoderThread = HandlerThread("freehands-encoder")
    private var encoderHandler: Handler? = null

    /**
     * Decodes the stream to CPU-readable frames so the verifier can diff them.
     *
     * The encoder's own surface cannot be read back, and Android 14+ allows only
     * one virtual display per consent, so the analysis path decodes the same
     * access units the feed carries. Decoding is throttled by [pipeline] to the
     * verifier's poll interval, so this costs a frame every couple of hundred
     * milliseconds rather than every frame.
     */
    private var analysisDecoder: MediaCodec? = null
    private var analysisFormat: MediaFormat? = null

    private val framer = CaptureFramer(
        width = settings.width,
        height = settings.height,
        bitrateKbps = settings.bitrateKbps,
    )

    @Volatile
    private var running = false

    val isRunning: Boolean get() = running

    /**
     * Starts capture for a consented [mediaProjection]. Returns false when the
     * encoder or the capture display could not be created; [onError] then holds
     * the reason.
     */
    fun start(mediaProjection: MediaProjection): Boolean {
        if (running) return true
        projection = mediaProjection

        encoderThread.start()
        encoderHandler = Handler(encoderThread.looper)

        val created = createEncoder()
        if (created == null) {
            releaseThreads()
            return false
        }
        codec = created

        // Required from Android 14: a projection without a callback is revoked.
        mediaProjection.registerCallback(projectionCallback, encoderHandler)

        val inputSurface = created.createInputSurface()
        val display = mediaProjection.createVirtualDisplay(
            DISPLAY_NAME,
            settings.width,
            settings.height,
            screenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            inputSurface,
            null,
            encoderHandler,
        )
        if (display == null) {
            onError("unable to create the capture display")
            stop()
            return false
        }
        encoderDisplay = display

        created.start()
        running = true
        return true
    }

    /** Stops capture and releases every native resource. Idempotent. */
    fun stop() {
        running = false
        runCatching { codec?.stop() }
        runCatching { codec?.release() }
        codec = null
        analysisDecoder?.let { decoder ->
            runCatching { decoder.stop() }
            runCatching { decoder.release() }
        }
        analysisDecoder = null
        analysisFormat = null
        encoderDisplay?.release()
        encoderDisplay = null
        runCatching { projection?.unregisterCallback(projectionCallback) }
        projection = null
        releaseThreads()
    }

    private fun releaseThreads() {
        if (encoderThread.isAlive) {
            encoderThread.quitSafely()
        }
        encoderHandler = null
    }

    private fun createEncoder(): MediaCodec? = try {
        val format = MediaFormat.createVideoFormat(MIME_TYPE, settings.width, settings.height).apply {
            setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
            )
            setInteger(MediaFormat.KEY_BIT_RATE, settings.bitrateKbps * 1000)
            setInteger(MediaFormat.KEY_FRAME_RATE, settings.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SECONDS)
        }
        val created = MediaCodec.createEncoderByType(MIME_TYPE)
        created.setCallback(encoderCallback, encoderHandler)
        created.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        created
    } catch (error: Exception) {
        onError("unable to start the screen encoder: ${error.message.orEmpty()}")
        null
    }

    /**
     * Feeds one access unit to the analysis decoder when a luma frame is due.
     * Failures disable analysis rather than the feed: verification degrades to
     * INCONCLUSIVE, which the agent treats as "cannot confirm", not as an error.
     */
    private fun feedAnalysis(frame: EncodedFrame) {
        if (!pipeline.lumaDue(System.currentTimeMillis())) {
            return
        }
        val decoder = analysisDecoder ?: createAnalysisDecoder() ?: return
        try {
            val index = decoder.dequeueInputBuffer(ANALYSIS_TIMEOUT_US)
            if (index < 0) {
                return
            }
            val buffer = decoder.getInputBuffer(index) ?: return
            buffer.clear()
            buffer.put(frame.data)
            decoder.queueInputBuffer(
                index,
                0,
                frame.data.size,
                frame.captureTimestampUs,
                if (frame.keyframe) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0,
            )
            drainAnalysis(decoder)
        } catch (error: IllegalStateException) {
            disableAnalysis("analysis decoder unavailable: ${error.message.orEmpty()}")
        }
    }

    private fun createAnalysisDecoder(): MediaCodec? {
        // The encoder's output format carries the SPS/PPS, which a decoder needs
        // before it can accept the stream; without it the first frames are
        // undecodable and no luma frame would ever be published.
        val format = analysisFormat ?: return null
        return try {
            val decoder = MediaCodec.createDecoderByType(MIME_TYPE)
            decoder.configure(format, null, null, 0)
            decoder.start()
            analysisDecoder = decoder
            decoder
        } catch (error: Exception) {
            disableAnalysis("analysis decoder unavailable: ${error.message.orEmpty()}")
            null
        }
    }

    private fun drainAnalysis(decoder: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (true) {
            val index = try {
                decoder.dequeueOutputBuffer(info, 0)
            } catch (error: IllegalStateException) {
                disableAnalysis("analysis decoder failed: ${error.message.orEmpty()}")
                return
            }
            if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
                return
            }
            if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                continue
            }
            if (index < 0) {
                continue
            }
            try {
                if (info.size > 0) {
                    publishLuma(decoder, index)
                }
            } finally {
                runCatching { decoder.releaseOutputBuffer(index, false) }
            }
        }
    }

    /** Reads the luma plane of a decoded frame and publishes it for diffing. */
    private fun publishLuma(decoder: MediaCodec, index: Int) {
        val image = try {
            decoder.getOutputImage(index)
        } catch (error: IllegalStateException) {
            null
        } ?: return
        try {
            val plane = image.planes.firstOrNull() ?: return
            val pixels = YuvLumaReader.readLuma(
                buffer = plane.buffer,
                width = image.width,
                height = image.height,
                rowStrideBytes = plane.rowStride,
                pixelStrideBytes = plane.pixelStride,
            ) ?: return
            val luma = LumaDownsampler.downsample(pixels, image.width, image.height) ?: return
            pipeline.onLuma(luma)
        } finally {
            image.close()
        }
    }

    private fun disableAnalysis(message: String) {
        analysisDecoder?.let { decoder ->
            runCatching { decoder.stop() }
            runCatching { decoder.release() }
        }
        analysisDecoder = null
        onError(message)
    }

    private val encoderCallback = object : MediaCodec.Callback() {
        override fun onInputBufferAvailable(codec: MediaCodec, index: Int) = Unit

        override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
            // The same format configures the analysis decoder: it carries the
            // SPS/PPS a decoder needs before it can accept the stream.
            analysisFormat = format
            val config = mutableListOf<ByteArray>()
            for (name in listOf("csd-0", "csd-1")) {
                val buffer: ByteBuffer? = format.getByteBuffer(name)
                if (buffer != null) {
                    val bytes = ByteArray(buffer.remaining())
                    buffer.get(bytes)
                    config += bytes
                }
            }
            if (config.isNotEmpty()) {
                framer.onCodecConfig(config)
            }
        }

        override fun onOutputBufferAvailable(
            codec: MediaCodec,
            index: Int,
            info: MediaCodec.BufferInfo,
        ) {
            try {
                val buffer = codec.getOutputBuffer(index) ?: return
                if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                    // Delivered in-band rather than through the output format.
                    if (info.size > 0) {
                        val config = ByteArray(info.size)
                        buffer.position(info.offset)
                        buffer.get(config)
                        framer.onCodecConfig(listOf(config))
                    }
                    return
                }
                if (info.size <= 0) {
                    return
                }
                val data = ByteArray(info.size)
                buffer.position(info.offset)
                buffer.get(data)
                val keyframe = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
                val frame = framer.frame(data, keyframe) ?: return
                pipeline.onEncoded(frame)
                feedAnalysis(frame)
            } catch (error: Exception) {
                onError("encoder output dropped: ${error.message.orEmpty()}")
            } finally {
                runCatching { codec.releaseOutputBuffer(index, false) }
            }
        }

        override fun onError(codec: MediaCodec, error: MediaCodec.CodecException) {
            onError("screen encoder error: ${error.diagnosticInfo.orEmpty()}")
        }
    }

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            // The user revoked capture from the system UI: stop cleanly so the
            // service can report that the feed ended rather than streaming
            // black frames.
            running = false
        }
    }

    companion object {
        const val MIME_TYPE = "video/avc"

        const val I_FRAME_INTERVAL_SECONDS = 2

        /** Bounded wait for an analysis input buffer; never blocks the feed. */
        private const val ANALYSIS_TIMEOUT_US = 10_000L
        private const val DISPLAY_NAME = "freehands-capture"
    }
}
