import { isNativeShell } from "#/utils/native-shell";

/** Marks `<html>` when the renderer is the packaged native app shell. */
export const IMMERSIVE_SHELL_ATTRIBUTE = "data-immersive-shell";

/**
 * Flag the document as the native app shell so the web layer can clear the
 * system bars. The Android activity draws edge to edge with the status and
 * navigation bars hidden, so without this the chat header and composer would
 * sit under the status bar and gesture bar. A no-op in a browser tab, where
 * the OS owns the window chrome and the safe-area insets are zero.
 */
export function markImmersiveShell(): boolean {
  if (!isNativeShell()) return false;

  document.documentElement.setAttribute(IMMERSIVE_SHELL_ATTRIBUTE, "true");
  return true;
}
