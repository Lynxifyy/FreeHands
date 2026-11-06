package dev.openhands.agentcanvas.freehands

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import dev.openhands.agentcanvas.BuildConfig
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * In-app updater for the Android shell.
 *
 * The web layer decides *whether* and *what* to install (it reads the FreeHands
 * release and picks the APK); this plugin downloads the APK and hands it to
 * Android's package installer. The user still confirms the install — that is an
 * OS requirement and cannot be skipped.
 *
 * Exposed to JavaScript as `Capacitor.Plugins.FreeHandsUpdater`, and adapted
 * into `window.freehandsUpdater` by `installAppUpdaterBridge()`.
 */
@CapacitorPlugin(name = "FreeHandsUpdater")
class FreeHandsUpdaterPlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun getInstalledVersion(call: PluginCall) {
        val result = JSObject()
        result.put("version", BuildConfig.VERSION_NAME)
        call.resolve(result)
    }

    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("A download URL is required.")
            return
        }

        executor.execute {
            try {
                val apk = download(url)
                launchInstaller(apk)
                call.resolve()
            } catch (error: Exception) {
                call.reject("Download failed: ${error.message}", error)
            }
        }
    }

    /** Download to the cache dir, emitting `downloadProgress` as bytes arrive. */
    private fun download(url: String): File {
        val target = File(context.cacheDir, AppUpdater.APK_FILE_NAME)
        if (target.exists()) target.delete()

        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
        }
        connection.connect()
        try {
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException("HTTP ${connection.responseCode}")
            }
            val total = connection.contentLengthLong
            connection.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var received = 0L
                    var lastEmit = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        received += read
                        // Throttle events so the WebView is not flooded.
                        if (received - lastEmit >= 256 * 1024 || received == total) {
                            lastEmit = received
                            val payload = JSObject()
                            payload.put("received", received)
                            payload.put("total", total)
                            notifyListeners("downloadProgress", payload)
                        }
                    }
                }
            }
        } finally {
            connection.disconnect()
        }
        return target
    }

    /**
     * Open the system package installer for the downloaded APK. On Android 8+
     * this requires the REQUEST_INSTALL_PACKAGES permission; when it is not yet
     * granted the user is sent to the app's "install unknown apps" settings.
     */
    private fun launchInstaller(apk: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(settings)
            throw IllegalStateException(
                "Allow installing unknown apps for FreeHands, then tap install again.",
            )
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apk,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
