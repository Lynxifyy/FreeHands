/**
 * GitHub release feed for the FreeHands fork. The Android app ships outside
 * the npm/GHCR channels, so its update card reads the release's APK asset and
 * notes directly from GitHub.
 */
const RELEASES_REPO = "Lynxifyy/FreeHands";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;

export interface FreeHandsRelease {
  tagName: string;
  /** Tag without the leading `v`, safe to compare with the app version. */
  version: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  /** The sideloadable release APK, when the release has one. */
  apkUrl: string | null;
}

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: GitHubAsset[];
}

function pickApk(assets: GitHubAsset[] | undefined): string | null {
  if (!assets?.length) return null;
  const apks = assets.filter((asset) => /\.apk$/i.test(asset.name ?? ""));
  const releaseApk = apks.find(
    (asset) => !/-debug\.apk$/i.test(asset.name ?? ""),
  );
  return (
    releaseApk?.browser_download_url ?? apks[0]?.browser_download_url ?? null
  );
}

export async function fetchLatestFreeHandsRelease(
  signal?: AbortSignal,
): Promise<FreeHandsRelease | null> {
  const response = await fetch(LATEST_RELEASE_URL, {
    signal,
    headers: { accept: "application/vnd.github+json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed (${response.status})`);
  }
  const data = (await response.json()) as GitHubRelease;
  const tagName = data.tag_name ?? "";
  if (!tagName) return null;
  return {
    tagName,
    version: tagName.replace(/^v/, ""),
    name: data.name ?? tagName,
    body: data.body ?? "",
    htmlUrl: data.html_url ?? "",
    publishedAt: data.published_at ?? "",
    apkUrl: pickApk(data.assets),
  };
}
