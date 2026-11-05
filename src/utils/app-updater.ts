import { isNativeShell } from "#/utils/native-shell";

/**
 * In-app update support for the Android shell.
 *
 * The WebView cannot install an APK on its own, so the native app injects a
 * `window.freehandsUpdater` bridge (see the Android `AppUpdater` plugin). It
 * downloads the release APK with progress and hands it to Android's package
 * installer; the user still confirms the install, which is an OS requirement.
 */

export interface AppUpdaterDownloadProgress {
  /** Bytes received so far. */
  received: number;
  /** Total bytes, or -1 when the server sends no Content-Length. */
  total: number;
}

export interface AppUpdaterBridge {
  /** The version string the installed APK reports. */
  getInstalledVersion: () => Promise<string>;
  /**
   * Download the APK at `url` and open the system installer. Resolves once the
   * installer has been launched (not when the user finishes installing).
   * `onProgress` fires as bytes arrive.
   */
  downloadAndInstall: (
    url: string,
    onProgress?: (progress: AppUpdaterDownloadProgress) => void,
  ) => Promise<void>;
}

declare global {
  interface Window {
    freehandsUpdater?: AppUpdaterBridge;
  }
}

export function getAppUpdaterBridge(): AppUpdaterBridge | null {
  if (typeof window === "undefined") return null;
  return window.freehandsUpdater ?? null;
}

/**
 * Build `window.freehandsUpdater` from the Capacitor plugin registry.
 *
 * The native `FreeHandsUpdater` plugin exposes methods under
 * `window.Capacitor.Plugins`; this adapts them to the plain bridge shape the
 * UI uses, translating the plugin's `downloadProgress` events into the
 * callback. Returns false when the shell has no such plugin.
 */
export function installAppUpdaterBridge(): boolean {
  if (typeof window === "undefined") return false;
  const plugin = window.Capacitor?.Plugins?.FreeHandsUpdater;
  if (!plugin) return false;

  window.freehandsUpdater = {
    getInstalledVersion: async () =>
      (await plugin.getInstalledVersion()).version,
    downloadAndInstall: async (url, onProgress) => {
      const handle = await plugin.addListener("downloadProgress", (data) => {
        onProgress?.({ received: data.received, total: data.total });
      });
      try {
        await plugin.downloadAndInstall({ url });
      } finally {
        // `addListener` may resolve synchronously (a handle) or a promise.
        (handle as { remove?: () => void } | undefined)?.remove?.();
      }
    },
  };
  return true;
}

/**
 * True only inside the packaged Android app *and* when the native updater
 * plugin is present. A browser tab never installs an APK, and the bridge is
 * absent on older shells.
 */
export function isInAppUpdateSupported(): boolean {
  return isNativeShell() && getAppUpdaterBridge() !== null;
}

/**
 * The release platform whose artifact this shell installs. Only the Android
 * shell updates itself in place; a browser/desktop build links to the release.
 */
export function pickPlatformForShell(native: boolean): "android" | null {
  return native ? "android" : null;
}
