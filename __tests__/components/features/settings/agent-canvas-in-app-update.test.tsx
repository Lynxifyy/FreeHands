import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentCanvasInAppUpdate } from "#/components/features/settings/agent-canvas-in-app-update";
import type { AppUpdaterBridge } from "#/utils/app-updater";

const release = {
  tag_name: "v1.30.0",
  html_url: "https://github.com/Lynxifyy/FreeHands/releases/tag/v1.30.0",
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
};

function setNative(withBridge: boolean) {
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
  };
  if (withBridge) {
    (window as unknown as { freehandsUpdater?: unknown }).freehandsUpdater = {
      getInstalledVersion: vi.fn().mockResolvedValue("1.29.0"),
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    } satisfies AppUpdaterBridge;
  }
}

afterEach(() => {
  delete (window as unknown as { freehandsUpdater?: unknown }).freehandsUpdater;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => release }),
  );
});

describe("AgentCanvasInAppUpdate", () => {
  it("renders nothing in a browser tab", () => {
    const { container } = render(<AgentCanvasInAppUpdate />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers an install button inside the Android shell", () => {
    setNative(true);
    render(<AgentCanvasInAppUpdate />);
    expect(screen.getByTestId("in-app-update-install")).toBeInTheDocument();
  });

  it("downloads the release APK and opens the installer", async () => {
    const user = userEvent.setup();
    setNative(true);
    render(<AgentCanvasInAppUpdate />);

    await user.click(screen.getByTestId("in-app-update-install"));

    await waitFor(() => {
      const bridge = (
        window as unknown as { freehandsUpdater: AppUpdaterBridge }
      ).freehandsUpdater;
      expect(bridge.downloadAndInstall).toHaveBeenCalledWith(
        "https://example.test/release.apk",
        expect.any(Function),
      );
    });
    expect(await screen.findByTestId("in-app-update-done")).toBeInTheDocument();
  });

  it("surfaces a download failure", async () => {
    const user = userEvent.setup();
    setNative(true);
    const bridge = (window as unknown as { freehandsUpdater: AppUpdaterBridge })
      .freehandsUpdater;
    (bridge.downloadAndInstall as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network down"),
    );
    render(<AgentCanvasInAppUpdate />);

    await user.click(screen.getByTestId("in-app-update-install"));

    expect(await screen.findByTestId("in-app-update-error")).toHaveTextContent(
      "network down",
    );
  });
});
