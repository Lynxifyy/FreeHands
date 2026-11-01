package dev.openhands.agentcanvas.freehands

import java.util.concurrent.atomic.AtomicLong
import org.json.JSONObject

/** Receives encoded access units from the screen encoder. */
fun interface EncodedFrameSink {
    fun onEncoded(frame: EncodedFrame)
}

/** Receives downsampled luma frames for action verification. */
fun interface LumaFrameSink {
    fun onLuma(frame: LumaFrame)
}

/**
 * Destination for encoded frames: the native bridge in production, a collector
 * in tests. Declared separately so the join can be exercised without the shared
 * library loaded.
 */
fun interface FramePusher {
    fun push(data: ByteArray, keyframe: Boolean, captureTimestampUs: Long, width: Int, height: Int): Boolean
}

/**
 * Connects the screen encoder to the native bridge and the verification path.
 *
 * This is the join between Android's capture APIs and the rest of the stack, so
 * it is deliberately free of Android types: the encoder and the image reader
 * push into it, and it forwards encoded access units to the frame pusher and
 * luma frames to [LatestFrameSource]. Keeping the join testable here leaves the
 * Android glue responsible only for configuring codecs.
 *
 * Luma frames are throttled: the verifier needs a fresh "after" frame only
 * every few hundred milliseconds, and converting every encoded frame would burn
 * CPU the encoder needs to stay inside the latency budget.
 */
class CapturePipeline(
    private val pusher: FramePusher,
    private val latestFrame: LatestFrameSource,
    private val recorder: SessionRecorder? = null,
    private val lumaIntervalMs: Long = DEFAULT_LUMA_INTERVAL_MS,
    private val clock: () -> Long = System::currentTimeMillis,
) : EncodedFrameSink, LumaFrameSink {

    private val encodedFrames = AtomicLong()
    private val keyframes = AtomicLong()
    private val rejectedFrames = AtomicLong()
    private val lumaFrames = AtomicLong()

    @Volatile
    private var lastLumaAtMs = UNSET_LUMA_AT_MS

    val encodedCount: Long get() = encodedFrames.get()

    val keyframeCount: Long get() = keyframes.get()

    val rejectedCount: Long get() = rejectedFrames.get()

    val lumaCount: Long get() = lumaFrames.get()

    override fun onEncoded(frame: EncodedFrame) {
        if (frame.data.isEmpty()) {
            return
        }
        val accepted = pusher.push(
            frame.data,
            frame.keyframe,
            frame.captureTimestampUs,
            frame.width,
            frame.height,
        )
        if (accepted) {
            encodedFrames.incrementAndGet()
            if (frame.keyframe) {
                keyframes.incrementAndGet()
            }
        } else {
            rejectedFrames.incrementAndGet()
        }
    }

    /** True when a luma frame may be published at [nowMs] without being throttled. */
    fun lumaDue(nowMs: Long): Boolean {
        val previous = lastLumaAtMs
        return previous == UNSET_LUMA_AT_MS || nowMs - previous >= lumaIntervalMs
    }

    override fun onLuma(frame: LumaFrame) {
        val now = clock()
        val previous = lastLumaAtMs
        // The unset sentinel must be compared before subtracting: `now -
        // Long.MIN_VALUE` overflows to a negative number, which would make the
        // first frame look like it arrived too soon and never publish.
        if (previous != UNSET_LUMA_AT_MS && now - previous < lumaIntervalMs) {
            return
        }
        lastLumaAtMs = now
        latestFrame.publish(frame)
        lumaFrames.incrementAndGet()
    }

    /** Records the pipeline counters into the session log for post-mortems. */
    fun recordSummary() {
        recorder?.record(
            "capture_summary",
            JSONObject()
                .put("encoded", encodedCount)
                .put("keyframes", keyframeCount)
                .put("rejected", rejectedCount)
                .put("luma", lumaCount),
        )
    }

    companion object {
        /** Matches the verifier's poll interval: more often is wasted work. */
        const val DEFAULT_LUMA_INTERVAL_MS = 200L

        /** Sentinel for "no luma frame published yet". */
        internal const val UNSET_LUMA_AT_MS = Long.MIN_VALUE
    }
}

/** Adapts [ScrcpyBridge] to the [FramePusher] seam. */
fun ScrcpyBridge.asFramePusher(): FramePusher =
    FramePusher { data, keyframe, captureTimestampUs, width, height ->
        pushFrame(
            data = data,
            captureTimestampUs = captureTimestampUs,
            keyframe = keyframe,
            width = width,
            height = height,
        )
    }
