import { afterEach, describe, expect, it } from "vitest";
import {
  IMMERSIVE_SHELL_ATTRIBUTE,
  markImmersiveShell,
} from "#/utils/immersive-shell";

function setCapacitor(runtime: Window["Capacitor"] | undefined) {
  if (runtime === undefined) {
    delete window.Capacitor;
    return;
  }
  window.Capacitor = runtime;
}

afterEach(() => {
  setCapacitor(undefined);
  document.documentElement.removeAttribute(IMMERSIVE_SHELL_ATTRIBUTE);
});

describe("markImmersiveShell", () => {
  it("marks the document when running inside the packaged native app", () => {
    setCapacitor({ isNativePlatform: () => true });

    expect(markImmersiveShell()).toBe(true);
    expect(
      document.documentElement.getAttribute(IMMERSIVE_SHELL_ATTRIBUTE),
    ).toBe("true");
  });

  it("leaves the document untouched in a browser tab", () => {
    expect(markImmersiveShell()).toBe(false);
    expect(
      document.documentElement.hasAttribute(IMMERSIVE_SHELL_ATTRIBUTE),
    ).toBe(false);
  });
});
