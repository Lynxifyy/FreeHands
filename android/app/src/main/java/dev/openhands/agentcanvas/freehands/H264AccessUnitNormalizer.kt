package dev.openhands.agentcanvas.freehands

import java.io.ByteArrayOutputStream

/**
 * Converts the buffers MediaCodec emits for H.264 into Annex-B access units.
 *
 * Encoders disagree on framing: some emit Annex-B start codes, others emit
 * 4-byte big-endian length prefixes, and the SPS/PPS may be delivered once
 * through the output format instead of in-band. The native parser reads a
 * single Annex-B stream, so both shapes are normalised here and the codec
 * configuration is re-injected ahead of the first keyframe.
 */
class H264AccessUnitNormalizer {

    /**
     * Returns an Annex-B access unit for [data], prefixing [codecConfig]
     * (SPS/PPS) when the unit is a keyframe that does not already carry it.
     */
    fun normalize(data: ByteArray, codecConfig: List<ByteArray> = emptyList()): ByteArray {
        if (data.isEmpty()) return ByteArray(0)

        val body = when {
            startsWithStartCode(data) -> data.copyOf()
            isLengthPrefixed(data) -> rewriteLengthPrefixed(data)
            else -> annexB(data, 0, data.size)
        }

        if (codecConfig.isEmpty() || containsSps(body)) {
            return body
        }

        val prefix = ByteArrayOutputStream()
        codecConfig.forEach { config ->
            val payload = withoutStartCode(config)
            if (payload.isNotEmpty()) {
                prefix.write(START_CODE, 0, START_CODE.size)
                prefix.write(payload, 0, payload.size)
            }
        }
        val prefixBytes = prefix.toByteArray()
        if (prefixBytes.isEmpty()) {
            return body
        }
        return prefixBytes + body
    }

    /** True when [data] carries an SPS (NAL type 7). */
    fun containsSps(data: ByteArray): Boolean {
        var index = 0
        while (index < data.size) {
            val start = findStartCode(data, index) ?: return false
            val header = start + startCodeLength(data, start)
            if (header < data.size && data[header].toInt() and NAL_TYPE_MASK == NAL_TYPE_SPS) {
                return true
            }
            index = header
        }
        return false
    }

    /** Drops a leading 3- or 4-byte start code, if present. */
    fun withoutStartCode(data: ByteArray): ByteArray {
        val length = startCodeLength(data, 0)
        return if (length > 0) data.copyOfRange(length, data.size) else data.copyOf()
    }

    private fun startsWithStartCode(data: ByteArray): Boolean = startCodeLength(data, 0) > 0

    /**
     * True when the whole buffer is a sequence of 4-byte length-prefixed NALs.
     *
     * The full buffer is walked rather than only the first prefix, so a plain
     * NAL whose leading bytes happen to look like a length cannot be mistaken
     * for the length-prefixed shape.
     */
    private fun isLengthPrefixed(data: ByteArray): Boolean {
        if (data.size < MIN_LENGTH_PREFIXED) return false
        var position = 0
        while (position + LENGTH_PREFIX_BYTES <= data.size) {
            val length = readInt(data, position)
            if (length <= 0) return false
            position += LENGTH_PREFIX_BYTES + length
        }
        return position == data.size
    }

    private fun rewriteLengthPrefixed(data: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(data.size + LENGTH_PREFIX_BYTES)
        var position = 0
        while (position + LENGTH_PREFIX_BYTES <= data.size) {
            val length = readInt(data, position)
            position += LENGTH_PREFIX_BYTES
            out.write(START_CODE, 0, START_CODE.size)
            out.write(data, position, length)
            position += length
        }
        return out.toByteArray()
    }

    private fun annexB(data: ByteArray, offset: Int, length: Int): ByteArray {
        val out = ByteArrayOutputStream(length + START_CODE.size)
        out.write(START_CODE, 0, START_CODE.size)
        out.write(data, offset, length)
        return out.toByteArray()
    }

    /** Length of the start code at [offset], or 0 when there is none. */
    private fun startCodeLength(data: ByteArray, offset: Int): Int {
        if (offset + 3 > data.size) return 0
        if (data[offset].toInt() != 0 || data[offset + 1].toInt() != 0) return 0
        return when {
            data[offset + 2].toInt() == 1 -> 3
            offset + 4 <= data.size && data[offset + 2].toInt() == 0 && data[offset + 3].toInt() == 1 -> 4
            else -> 0
        }
    }

    /** Offset of the next start code at or after [from], or null. */
    private fun findStartCode(data: ByteArray, from: Int): Int? {
        var index = from.coerceAtLeast(0)
        while (index < data.size) {
            if (startCodeLength(data, index) > 0) return index
            index++
        }
        return null
    }

    private fun readInt(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xFF shl 24) or
            (data[offset + 1].toInt() and 0xFF shl 16) or
            (data[offset + 2].toInt() and 0xFF shl 8) or
            (data[offset + 3].toInt() and 0xFF)

    companion object {
        /** Annex-B 4-byte start code; always 4 bytes so offsets stay stable. */
        val START_CODE = byteArrayOf(0, 0, 0, 1)

        const val NAL_TYPE_MASK = 0x1F
        const val NAL_TYPE_SPS = 7

        private const val LENGTH_PREFIX_BYTES = 4
        private const val MIN_LENGTH_PREFIXED = LENGTH_PREFIX_BYTES + 1
    }
}
