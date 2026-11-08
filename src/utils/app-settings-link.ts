import { getLockedCloudHost } from "#/api/agent-server-config";
import { isAppShell } from "#/utils/app-shell";

export interface AppSettingsLinkAttributes {
  href: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
}

export interface AppSettingsLinkContext {
  /** Whether the settings page shares the app's origin. */
  sameOrigin: boolean;
  /** Whether the renderer is a packaged app rather than a browser tab. */
  isAppShell: boolean;
}

/**
 * Decide how a settings-page link behaves.
 *
 * A page on the app's own origin is navigated to in place, so browser Back
 * returns to the canvas. A cross-origin page opens in a new tab in a browser.
 * Inside a packaged app there is no external browser to hand the URL to, so a
 * cross-origin page is dropped — the caller renders nothing rather than a dead
 * link.
 */
export function resolveAppSettingsLink(
  url: string,
  context: AppSettingsLinkContext,
): AppSettingsLinkAttributes | null {
  if (context.sameOrigin) return { href: url };
  if (context.isAppShell) return null;
  return { href: url, target: "_blank", rel: "noopener noreferrer" };
}

/**
 * Resolve a settings link against the live environment. The page navigates in
 * place when it is served from this app's own deployment: a locked-to-Cloud
 * canvas (single host) or a URL sharing the canvas origin. Inside the packaged
 * app a cross-origin page has no browser to open in, so it is dropped.
 */
export function appSettingsLinkAttributes(
  url: string,
): AppSettingsLinkAttributes | null {
  return resolveAppSettingsLink(url, {
    sameOrigin: isSameOriginAsApp(url),
    isAppShell: isAppShell(),
  });
}

function isSameOriginAsApp(url: string): boolean {
  if (getLockedCloudHost() !== null) return true;
  if (typeof window === "undefined") return false;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}
