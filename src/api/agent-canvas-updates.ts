/**
 * Source of truth for "is a newer FreeHands published?".
 *
 * FreeHands is a fork, so the update channel is its own GitHub Releases, not
 * the upstream OpenHands npm package — checking npm would always report the
 * upstream version as "latest" and never match what this app ships. The GitHub
 * releases API is CORS-open (`access-control-allow-origin: *`) and returns the
 * tag plus the downloadable artifacts for each platform.
 */

const FREEHANDS_OWNER = "Lynxifyy";
const FREEHANDS_REPO = "FreeHands";

/** Public releases page, used for the "release notes" links. */
export const AGENT_CANVAS_RELEASES_URL = `https://github.com/${FREEHANDS_OWNER}/${FREEHANDS_REPO}/releases`;

export const AGENT_CANVAS_RELEASE_NOTES_URL = AGENT_CANVAS_RELEASES_URL;

const LATEST_RELEASE_URL = `https://api.github.com/repos/${FREEHANDS_OWNER}/${FREEHANDS_REPO}/releases/latest`;

/** Literal shell commands — intentionally not localized. */
export const AGENT_CANVAS_UPDATE_COMMANDS = {
  npm: `npm install -g https://github.com/${FREEHANDS_OWNER}/${FREEHANDS_REPO}.git`,
  docker: "docker pull ghcr.io/lynxifyy/freehands:latest",
} as const;

export type ReleasePlatform = "android" | "windows" | "macos" | "linux";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface AgentCanvasRelease {
  /** Version with any leading `v` removed, e.g. "1.29.0". */
  version: string;
  /** Tag exactly as published, e.g. "v1.29.0". */
  tagName: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAsset(value: unknown): ReleaseAsset | null {
  if (!isRecord(value)) return null;
  const name = value.name;
  const url = value.browser_download_url;
  if (typeof name !== "string" || typeof url !== "string") return null;
  return { name, browser_download_url: url };
}

/**
 * Latest published FreeHands release. Throws on a non-OK response or a body
 * without a usable tag; the query hook renders that inline.
 */
export async function fetchLatestAgentCanvasRelease(
  signal?: AbortSignal,
): Promise<AgentCanvasRelease> {
  const response = await fetch(LATEST_RELEASE_URL, {
    signal,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub releases responded ${response.status}`);
  }
  const body: unknown = await response.json();
  const tagName =
    isRecord(body) && typeof body.tag_name === "string"
      ? body.tag_name.trim()
      : "";
  if (!tagName) {
    throw new Error("GitHub release response missing tag_name");
  }
  const assets =
    isRecord(body) && Array.isArray(body.assets)
      ? body.assets
          .map(normalizeAsset)
          .filter((asset): asset is ReleaseAsset => asset !== null)
      : [];
  const htmlUrl =
    isRecord(body) && typeof body.html_url === "string"
      ? body.html_url
      : `${AGENT_CANVAS_RELEASES_URL}/tag/${tagName}`;
  return {
    version: tagName.replace(/^v/i, ""),
    tagName,
    htmlUrl,
    assets,
  };
}

export async function fetchLatestAgentCanvasVersion(
  signal?: AbortSignal,
): Promise<string> {
  const release = await fetchLatestAgentCanvasRelease(signal);
  return release.version;
}

function pickBy(
  assets: ReleaseAsset[],
  matches: (lowerName: string) => boolean,
  reject: (lowerName: string) => boolean = () => false,
): ReleaseAsset | null {
  const candidates = assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return matches(name) && !reject(name);
  });
  return candidates[0] ?? null;
}

/**
 * The artifact to download for a platform. Prefers a release (non-debug) build
 * and returns null when the release has nothing for that platform, so callers
 * can fall back to the releases page.
 */
export function pickReleaseAsset(
  assets: ReleaseAsset[],
  platform: ReleasePlatform,
): ReleaseAsset | null {
  const isDebug = (name: string) => name.includes("debug");
  switch (platform) {
    case "android":
      return (
        pickBy(assets, (n) => n.endsWith(".apk"), isDebug) ??
        pickBy(assets, (n) => n.endsWith(".apk"))
      );
    case "windows":
      return (
        pickBy(assets, (n) => n.endsWith(".exe"), isDebug) ??
        pickBy(assets, (n) => n.endsWith(".exe"))
      );
    case "macos":
      return (
        pickBy(assets, (n) => n.endsWith(".dmg"), isDebug) ??
        pickBy(assets, (n) => n.endsWith(".dmg"))
      );
    case "linux":
      return (
        pickBy(assets, (n) => n.endsWith(".appimage"), isDebug) ??
        pickBy(assets, (n) => n.endsWith(".deb"), isDebug) ??
        pickBy(assets, (n) => n.endsWith(".appimage")) ??
        pickBy(assets, (n) => n.endsWith(".deb"))
      );
    default:
      return null;
  }
}
