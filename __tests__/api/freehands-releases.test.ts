import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestFreeHandsRelease } from "#/api/freehands-releases";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }),
  );
}

describe("fetchLatestFreeHandsRelease", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the sideloadable release APK over the debug APK", async () => {
    mockFetch(200, {
      tag_name: "v1.30.0",
      name: "v1.30.0",
      body: "Notes",
      html_url: "https://example.test/release",
      published_at: "2026-11-22T00:00:00Z",
      assets: [
        {
          name: "agent-canvas-1.30.0-debug.apk",
          browser_download_url: "https://example.test/debug.apk",
        },
        {
          name: "agent-canvas-1.30.0.apk",
          browser_download_url: "https://example.test/release.apk",
        },
      ],
    });

    const release = await fetchLatestFreeHandsRelease();

    expect(release).toMatchObject({
      version: "1.30.0",
      apkUrl: "https://example.test/release.apk",
      body: "Notes",
    });
  });

  it("returns null when there is no published release", async () => {
    mockFetch(404, {});
    await expect(fetchLatestFreeHandsRelease()).resolves.toBeNull();
  });
});
