package dev.openhands.agentcanvas.freehands

/** Stages of the live-feed pipeline, ordered capture -> analyze. */
enum class FeedStage(val index: Int) {
    CAPTURE(0),
    ENCODE(1),
    TRANSMIT(2),
    DECODE(3),
    ANALYZE(4);

    companion object {
        fun fromIndex(index: Int): FeedStage? = entries.firstOrNull { it.index == index }
    }
}

/** Immutable breakdown of the pipeline latency, in milliseconds. */
data class LatencySnapshot(
    val budgetMs: Long,
    val stageMs: List<Long>,
    val samples: Long,
) {
    val totalMs: Long get() = stageMs.sum()

    val remainingMs: Long get() = (budgetMs - totalMs).coerceAtLeast(0)

    val withinBudget: Boolean get() = totalMs <= budgetMs

    fun stage(stage: FeedStage): Long = stageMs.getOrElse(stage.index) { 0L }
}

/**
 * Tracks the end-to-end latency budget for the live feed.
 *
 * The native pipeline reports capture, encode, decode and analyze timings; the
 * transmit stage is measured here because only the server sees the socket.
 * Both feed the same smoothed breakdown so the UI shows one consistent number
 * against the 150 ms target.
 */
class LatencyBudget(private val budgetMs: Long = DEFAULT_BUDGET_MS) {

    init {
        require(budgetMs > 0) { "budgetMs must be positive" }
    }

    private val ewma = DoubleArray(FeedStage.entries.size)
    private val seen = BooleanArray(FeedStage.entries.size)
    private var samples = 0L

    /** Records a completed stage duration and returns this budget for chaining. */
    fun record(stage: FeedStage, durationMs: Long): LatencyBudget {
        val value = durationMs.coerceAtLeast(0L).toDouble()
        val index = stage.index
        ewma[index] = if (seen[index]) SMOOTHING * value + (1 - SMOOTHING) * ewma[index] else value
        seen[index] = true
        samples++
        return this
    }

    /**
     * Imports the native stage snapshot and keeps the locally measured transmit
     * stage, which the native side cannot observe.
     *
     * The array layout matches the JNI contract:
     * `[budget, total, remaining, capture, encode, transmit, decode, analyze, samples]`.
     */
    fun mergeNativeStats(stats: LongArray): LatencyBudget {
        if (stats.size < NATIVE_STATS_SIZE) {
            return this
        }
        for (stage in FeedStage.entries) {
            if (stage == FeedStage.TRANSMIT) {
                continue
            }
            val nativeValue = stats[3 + stage.index]
            ewma[stage.index] = nativeValue.coerceAtLeast(0L).toDouble()
            seen[stage.index] = true
        }
        samples = maxOf(samples, stats[8])
        return this
    }

    fun snapshot(): LatencySnapshot = LatencySnapshot(
        budgetMs = budgetMs,
        stageMs = FeedStage.entries.map { roundToLong(ewma[it.index]) },
        samples = samples,
    )

    fun reset() {
        ewma.fill(0.0)
        seen.fill(false)
        samples = 0
    }

    private fun roundToLong(value: Double): Long = kotlin.math.round(value).toLong()

    companion object {
        const val DEFAULT_BUDGET_MS = 150L
        const val SMOOTHING = 0.2
        private const val NATIVE_STATS_SIZE = 9
    }
}
