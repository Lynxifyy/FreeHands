package dev.openhands.agentcanvas.freehands

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapturePipelineTest {

    private class Pusher(private val accept: Boolean = true) : FramePusher {
        val calls = AtomicInteger()
        val keyframes = AtomicInteger()
        var lastWidth = 0
        var lastHeight = 0

        override fun push(
            data: ByteArray,
            keyframe: Boolean,
            captureTimestampUs: Long,
            width: Int,
            height: Int,
        ): Boolean {
            calls.incrementAndGet()
            if (keyframe) keyframes.incrementAndGet()
            lastWidth = width
            lastHeight = height
            return accept
        }
    }

    private fun pipeline(
        pusher: FramePusher,
        source: LatestFrameSource = LatestFrameSource(),
        clock: () -> Long = { 0L },
    ) = CapturePipeline(
        pusher = pusher,
        latestFrame = source,
        lumaIntervalMs = 200,
        clock = clock,
    )

    /** Builds the frame the encoder would hand the pipeline. */
    private fun encoded(data: ByteArray, keyframe: Boolean, timestampUs: Long) = EncodedFrame(
        data = data,
        sequence = 0,
        captureTimestampUs = timestampUs,
        keyframe = keyframe,
        width = 1080,
        height = 1920,
        bitrateKbps = 4000,
    )

    @Test
    fun `forwards encoded frames to the pusher with the encoder geometry`() {
        val pusher = Pusher()
        val pipeline = pipeline(pusher)

        pipeline.onEncoded(encoded(byteArrayOf(1, 2, 3), keyframe = true, timestampUs = 42))

        assertEquals(1, pusher.calls.get())
        assertEquals(1, pusher.keyframes.get())
        assertEquals(1L, pipeline.encodedCount)
        assertEquals(1L, pipeline.keyframeCount)
        assertEquals(1080, pusher.lastWidth)
        assertEquals(1920, pusher.lastHeight)
    }

    @Test
    fun `empty buffers are ignored`() {
        val pusher = Pusher()
        val pipeline = pipeline(pusher)

        pipeline.onEncoded(encoded(ByteArray(0), keyframe = true, timestampUs = 0))

        assertEquals(0, pusher.calls.get())
        assertEquals(0L, pipeline.encodedCount)
    }

    @Test
    fun `a rejected frame is counted but not treated as encoded`() {
        val pusher = Pusher(accept = false)
        val pipeline = pipeline(pusher)

        pipeline.onEncoded(encoded(byteArrayOf(9), keyframe = false, timestampUs = 0))

        assertEquals(0L, pipeline.encodedCount)
        assertEquals(1L, pipeline.rejectedCount)
    }

    @Test
    fun `publishes the first luma frame immediately`() {
        val source = LatestFrameSource()
        val pipeline = pipeline(Pusher(), source, clock = { 1_000L })

        pipeline.onLuma(LumaFrame.uniform(4, 4, 10))

        assertEquals(10, source.latest()!!.at(0, 0))
        assertEquals(1L, pipeline.lumaCount)
    }

    @Test
    fun `throttles luma frames within the interval`() {
        var now = 1_000L
        val source = LatestFrameSource()
        val pipeline = pipeline(Pusher(), source, clock = { now })

        pipeline.onLuma(LumaFrame.uniform(4, 4, 10))
        now = 1_100L
        pipeline.onLuma(LumaFrame.uniform(4, 4, 20))

        assertEquals(1L, pipeline.lumaCount)
        assertEquals(10, source.latest()!!.at(0, 0))

        now = 1_250L
        pipeline.onLuma(LumaFrame.uniform(4, 4, 30))

        assertEquals(2L, pipeline.lumaCount)
        assertEquals(30, source.latest()!!.at(0, 0))
    }

    @Test
    fun `luma is due on the first frame and not again inside the interval`() {
        val pipeline = pipeline(Pusher(), clock = { 1_000L })

        assertTrue(pipeline.lumaDue(1_000L))

        pipeline.onLuma(LumaFrame.uniform(4, 4, 10))

        assertFalse(pipeline.lumaDue(1_100L))
        assertTrue(pipeline.lumaDue(1_200L))
    }

    @Test
    fun `summary writes the counters to the session recorder`() {
        val directory = java.nio.file.Files.createTempDirectory("pipeline").toFile()
        val recorder = SessionRecorder(directory, clock = { 1L }, sessionId = "capture")
        val pipeline = CapturePipeline(
            pusher = Pusher(),
            latestFrame = LatestFrameSource(),
            recorder = recorder,
        )
        pipeline.onEncoded(encoded(byteArrayOf(1), keyframe = true, timestampUs = 0))
        pipeline.recordSummary()

        val events = recorder.readAll()

        assertEquals(1, events.size)
        assertEquals("capture_summary", events.first().type)
        assertEquals(1, events.first().detail.getInt("encoded"))
        assertEquals(1, events.first().detail.getInt("keyframes"))
        recorder.close()
        directory.deleteRecursively()
    }
}
