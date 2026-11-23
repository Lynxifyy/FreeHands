import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AndroidUpdateSection } from "#/components/features/settings/android-update-section";

const mocks = vi.hoisted(() => ({
  platform: "android",
  release: null as
    | {
        version: string;
        apkUrl: string | null;
        body: string;
        tagName: string;
        name: string;
        htmlUrl: string;
        publishedAt: string;
      }
    | null,
  isError: false,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => mocks.platform },
}));

vi.mock("#/hooks/query/use-latest-freehands-release", () => ({
  useLatestFreeHandsRelease: () => ({
    data: mocks.release,
    isError: mocks.isError,
  }),
}));

describe("AndroidUpdateSection", () => {
  beforeEach(() => {
    mocks.platform = "android";
    mocks.isError = false;
    mocks.release = {
      tagName: "v1.31.0",
      version: "1.31.0",
      name: "v1.31.0",
      body: "### Fixes\n\n- Fixed the thing",
      htmlUrl: "https://example.test/release",
      publishedAt: "2026-11-22T00:00:00Z",
      apkUrl: "https://example.test/agent-canvas-1.31.0.apk",
    };
  });

  it("shows the APK install action and the release notes on Android", () => {
    render(<AndroidUpdateSection />);

    expect(screen.getByTestId("android-update-section")).toBeInTheDocument();
    expect(screen.getByTestId("android-update-install")).toHaveAttribute(
      "href",
      "https://example.test/agent-canvas-1.31.0.apk",
    );
    expect(screen.getByText("SETTINGS$ANDROID_WHATS_NEW")).toBeInTheDocument();
    expect(screen.getByText(/Fixed the thing/)).toBeInTheDocument();
  });

  it("renders nothing outside the Android app", () => {
    mocks.platform = "web";
    render(<AndroidUpdateSection />);
    expect(
      screen.queryByTestId("android-update-section"),
    ).not.toBeInTheDocument();
  });
});
