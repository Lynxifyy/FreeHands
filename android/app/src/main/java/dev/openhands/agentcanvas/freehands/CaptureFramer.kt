package dev.openhands.agentcanvas.freehands

/**
 * Turns one MediaCodec output buffer into the frame the native bridge expects.
 *
 * Holds the codec configuration (SPS/PPS) delivered out-of-band by the encoder
 * and stamps each buffer with a capture timestamp. The timestamp is taken when
 * the buffer is handed over rather than when it reaches the bridge, so the
 * latency budget measures the whole capture-to-transmit path.
 */
class CaptureFramer(
    private val width: Int,
    private val height: Int,
    private val bitrateKbps: Int,
    private val clock: () -> Long = System::nanoTime,
) {

    private val normalizer = H264AccessUnitNormalizer()
    private var codecConfig: List<ByteArray> = emptyList()

    /** True once the encoder has delivered its SPS/PPS. */
    val hasCodecConfig: Boolean get() = codecConfig.isNotEmpty()

    /** Records the codec configuration (SPS/PPS) from the output format. */
    fun onCodecConfig(buffers: List<ByteArray>) {
        codecConfig = buffers.map { it.copyOf() }.filter { it.isNotEmpty() }
    }

    /**
     * Builds the frame for one encoded buffer, or null when the buffer is
     * empty. A keyframe gets the codec configuration prepended when the
     * encoder did not already emit it in-band.
     */
    fun frame(data: ByteArray, keyframe: Boolean): EncodedFrame? {
        if (data.isEmpty()) return null
        val payload = normalizer.normalize(data, if (keyframe) codecConfig else emptyList())
        if (payload.isEmpty()) return null
        return EncodedFrame(
            data = payload,
            sequence = 0,
            captureTimestampUs = clock() / NANOS_PER_MICRO,
            keyframe = keyframe,
            width = width,
            height = height,
            bitrateKbps = bitrateKbps,
        )
    }

    companion object {
        const val NANOS_PER_MICRO = 1_000L
    }
}
