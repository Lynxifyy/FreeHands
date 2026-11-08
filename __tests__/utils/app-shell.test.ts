import { afterEach, describe, expect, it } from "vitest";
import { isAppShell } from "#/utils/app-shell";

const setCapacitor = (runtime: unknown) => {
  (window as unknown as { Capacitor?: unknown }).Capacitor = runtime;
};

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  delete (window as unknown as { desktopShell?: unknown }).desktopShell;
});

describe("isAppShell", () => {
  it("is true in the packaged Android app", () => {
    setCapacitor({ isNativePlatform: () => true });

    expect(isAppShell()).toBe(true);
  });

  it("is true in the desktop app", () => {
    (window as unknown as { desktopShell?: unknown }).desktopShell = {
      platform: "darwin",
    };

    expect(isAppShell()).toBe(true);
  });

  it("is false in a browser tab", () => {
    expect(isAppShell()).toBe(false);
  });
});
