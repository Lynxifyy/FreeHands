package dev.openhands.agentcanvas.freehands

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager

/**
 * Carries the user's screen-capture consent from the activity to the service.
 *
 * Android grants a projection only against the exact result code and data
 * Intent returned by the consent dialog, and the consent cannot be replayed
 * across processes. The activity therefore stores them here, and the service —
 * which may be started later, or restarted by the system — collects them once.
 * Holding them in memory rather than in the Intent extras keeps a replayable
 * consent token out of a persisted, exported-by-accident channel.
 */
object CaptureConsent {

    private var resultCode: Int = 0
    private var data: Intent? = null

    /** True when the user has granted capture and the grant is unused. */
    val isGranted: Boolean get() = data != null && resultCode != 0

    /** Records a granted consent. */
    fun grant(resultCode: Int, data: Intent) {
        this.resultCode = resultCode
        this.data = data
    }

    /** Discards any consent, granted or not. */
    fun clear() {
        resultCode = 0
        data = null
    }

    /**
     * Builds the projection for a granted consent and consumes it, so a second
     * start cannot reuse a token the system has already spent. Returns null
     * when no consent is held or the system refuses.
     */
    fun consume(context: Context): MediaProjection? {
        val granted = data ?: return null
        val code = resultCode
        clear()
        return try {
            val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
            manager?.getMediaProjection(code, granted)
        } catch (error: Exception) {
            null
        }
    }
}
