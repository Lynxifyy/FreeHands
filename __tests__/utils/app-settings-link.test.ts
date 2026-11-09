import { describe, expect, it } from "vitest";
import { resolveAppSettingsLink } from "#/utils/app-settings-link";

describe("resolveAppSettingsLink", () => {
  const url = "https://cloud.example.com/settings?org=org-1";

  it("opens a cross-origin settings page in a new tab in a browser", () => {
    expect(
      resolveAppSettingsLink(url, { sameOrigin: false, isAppShell: false }),
    ).toEqual({
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("navigates in place when the page shares the app's origin", () => {
    expect(
      resolveAppSettingsLink(url, { sameOrigin: true, isAppShell: false }),
    ).toEqual({ href: url });
  });

  it("drops a hosted settings page inside the app shell, same origin or not", () => {
    expect(
      resolveAppSettingsLink(url, { sameOrigin: true, isAppShell: true }),
    ).toBeNull();
    expect(
      resolveAppSettingsLink(url, { sameOrigin: false, isAppShell: true }),
    ).toBeNull();
  });
});
