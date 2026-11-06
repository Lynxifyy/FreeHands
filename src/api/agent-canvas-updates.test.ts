import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_CANVAS_RELEASES_URL,
  fetchLatestAgentCanvasRelease,
  fetchLatestAgentCanvasVersion,
  pickReleaseAsset,
} from "./agent-canvas-updates";

function stubFetchResponse(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const releaseBody = {
  tag_name: "v1.29.0",
  html_url: "https://github.com/Lynxifyy/FreeHands/releases/tag/v1.29.0",
  assets: [
    {
      name: "agent-canvas-1.29.0-debug.apk",
      browser_download_url:
        "https://github.com/Lynxifyy/FreeHands/releases/download/v1.29.0/agent-canvas-1.29.0-debug.apk",
    },
    {
      name: "agent-canvas-1.29.0.apk",
      browser_download_url:
        "https://github.com/Lynxifyy/FreeHands/releases/download/v1.29.0/agent-canvas-1.29.0.apk",
    },
    {
      name: "OpenHands-Agent-Canvas-Setup-1.29.0.exe",
      browser_download_url:
        "https://github.com/Lynxifyy/FreeHands/releases/download/v1.29.0/OpenHands-Agent-Canvas-Setup-1.29.0.exe",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLatestAgentCanvasRelease", () => {
  it("reads the FreeHands GitHub release, not the upstream npm package", async () => {
    const fetchMock = stubFetchResponse({
      ok: true,
      json: async () => releaseBody,
    });

    const release = await fetchLatestAgentCanvasRelease();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/Lynxifyy/FreeHands/releases/latest",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(release.version).toBe("1.29.0");
    expect(release.htmlUrl).toBe(`${AGENT_CANVAS_RELEASES_URL}/tag/v1.29.0`);
    expect(release.assets).toHaveLength(3);
  });

  it("strips a leading v from the tag", async () => {
    stubFetchResponse({ ok: true, json: async () => ({ tag_name: "v2.0.1" }) });
    const release = await fetchLatestAgentCanvasRelease();
    expect(release.version).toBe("2.0.1");
  });

  it("rejects when the release has no usable tag", async () => {
    stubFetchResponse({ ok: true, json: async () => ({ tag_name: "  " }) });
    await expect(fetchLatestAgentCanvasRelease()).rejects.toThrow("tag_name");
  });

  it("rejects on an error status", async () => {
    stubFetchResponse({ ok: false, status: 503 });
    await expect(fetchLatestAgentCanvasRelease()).rejects.toThrow("503");
  });
});

describe("fetchLatestAgentCanvasVersion", () => {
  it("returns just the version string", async () => {
    stubFetchResponse({ ok: true, json: async () => releaseBody });
    await expect(fetchLatestAgentCanvasVersion()).resolves.toBe("1.29.0");
  });
});

describe("pickReleaseAsset", () => {
  const assets = releaseBody.assets;

  it("prefers the release APK over the debug build for Android", () => {
    expect(pickReleaseAsset(assets, "android")?.name).toBe(
      "agent-canvas-1.29.0.apk",
    );
  });

  it("picks the Windows installer", () => {
    expect(pickReleaseAsset(assets, "windows")?.name).toContain(".exe");
  });

  it("returns null when the platform has no asset", () => {
    expect(pickReleaseAsset(assets, "macos")).toBeNull();
  });
});
