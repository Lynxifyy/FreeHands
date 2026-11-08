import { isDesktopShell } from "#/utils/desktop-shell";
import { isNativeShell } from "#/utils/native-shell";

/**
 * Whether the renderer is running inside a packaged app (the Android WebView
 * or the Electron desktop shell) rather than a browser tab.
 *
 * An app shell owns its own window: it cannot hand a URL to an external
 * browser, so the UI must keep navigation inside the app. Links that would
 * otherwise open in a new tab route in place when they share the app's origin
 * and are dropped when they do not.
 */
export function isAppShell(): boolean {
  return isNativeShell() || isDesktopShell();
}
