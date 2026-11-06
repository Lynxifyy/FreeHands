import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AppUpdaterBridge,
  getAppUpdaterBridge,
  installAppUpdaterBridge,
  isInAppUpdateSupported,
  pickPlatformForShell,
} from "#/utils/app-updater";

function installBridge(bridge: Partial<AppUpdaterBridge> | undefined) {
  (window as unknown as { freehandsUpdater?: unknown }).freehandsUpdater =
    bridge;
}

afterEach(() => {
  delete (window as unknown as { freehandsUpdater?: unknown }).freehandsUpdater;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.restoreAllMocks();
});

describe("getAppUpdaterBridge", () => {
  it("returns the injected bridge when present", () => {
    const bridge: AppUpdaterBridge = {
      getInstalledVersion: vi.fn().mockResolvedValue("1.29.0"),
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    };
    installBridge(bridge);

    expect(getAppUpdaterBridge()).toBe(bridge);
  });

  it("returns null when no bridge is injected", () => {
    expect(getAppUpdaterBridge()).toBeNull();
  });

  it("builds the bridge from the Capacitor plugin registry", async () => {
    const remove = vi.fn();
    const progressListeners: ((d: {
      received: number;
      total: number;
    }) => void)[] = [];
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        FreeHandsUpdater: {
          getInstalledVersion: vi.fn().mockResolvedValue({ version: "1.30.0" }),
          downloadAndInstall: vi.fn().mockResolvedValue(undefined),
          addListener: vi.fn(
            (
              _event: string,
              listener: (d: { received: number; total: number }) => void,
            ) => {
              progressListeners.push(listener);
              return { remove };
            },
          ),
        },
      },
    };

    expect(installAppUpdaterBridge()).toBe(true);
    const bridge = getAppUpdaterBridge()!;
    await expect(bridge.getInstalledVersion()).resolves.toBe("1.30.0");

    const onProgress = vi.fn();
    await bridge.downloadAndInstall("https://example.test/app.apk", onProgress);
    progressListeners.forEach((listener) =>
      listener({ received: 50, total: 100 }),
    );
    expect(onProgress).toHaveBeenCalledWith({ received: 50, total: 100 });
    expect(remove).toHaveBeenCalled();
  });

  it("does not install the bridge when the plugin is absent", () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(installAppUpdaterBridge()).toBe(false);
    expect(getAppUpdaterBridge()).toBeNull();
  });
});

describe("isInAppUpdateSupported", () => {
  it("is true only inside the Android shell with the bridge", () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    installBridge({
      downloadAndInstall: vi.fn(),
      getInstalledVersion: vi.fn(),
    });

    expect(isInAppUpdateSupported()).toBe(true);
  });

  it("is false in a browser tab even with the bridge present", () => {
    installBridge({
      downloadAndInstall: vi.fn(),
      getInstalledVersion: vi.fn(),
    });
    expect(isInAppUpdateSupported()).toBe(false);
  });

  it("is false in the native shell without the bridge", () => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(isInAppUpdateSupported()).toBe(false);
  });
});

describe("pickPlatformForShell", () => {
  it("maps the native shell to android", () => {
    expect(pickPlatformForShell(true)).toBe("android");
  });

  it("maps a non-native shell to null (browser handles its own update)", () => {
    expect(pickPlatformForShell(false)).toBeNull();
  });
});
