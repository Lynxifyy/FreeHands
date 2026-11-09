package dev.openhands.agentcanvas;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import dev.openhands.agentcanvas.freehands.FreeHandsUpdaterPlugin;

/**
 * WebView host for the Agent Canvas static build.
 *
 * The activity draws edge to edge with the status and navigation bars hidden,
 * so the canvas reads as a real app instead of a page in a browser chrome; the
 * web bundle pads itself by the display insets (see `markImmersiveShell`). The
 * bars are re-hidden whenever the window regains focus, since the system
 * reveals them transiently on a swipe or a soft-keyboard transition.
 *
 * A low-importance foreground service is held while the app is backgrounded so
 * the WebView (and its agent-server WebSocket) survives the activity leaving
 * the foreground. On resume the page-visibility hook in the web bundle
 * reconnects any stale socket, so a conversation that kept running server-side
 * picks back up.
 *
 * The in-app updater plugin is registered here so the web layer can download
 * and install a newer FreeHands APK without leaving the app.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FreeHandsUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        enterImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    /**
     * Hide the system bars and let the WebView fill the whole display,
     * including the display cutout. Bars reappear transiently on an edge swipe
     * and are hidden again on the next focus change.
     */
    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onStart() {
        super.onStart();
        ConnectionKeepAliveService.stop(this);
    }

    @Override
    public void onStop() {
        super.onStop();
        ConnectionKeepAliveService.start(this);
    }
}
