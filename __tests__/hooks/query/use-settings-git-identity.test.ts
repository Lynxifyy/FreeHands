import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { getSettingsQueryFn } from "#/hooks/query/use-settings";
import { DEFAULT_SETTINGS } from "#/services/settings";
import type { Settings } from "#/types/settings";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getSettingsQueryFn git identity", () => {
  it("commits as the signed-in account when no git identity is set", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      email: "ada@example.com",
      git_user_name: "",
      git_user_email: "",
    } satisfies Settings);

    const settings = await getSettingsQueryFn();

    expect(settings.git_user_email).toBe("ada@example.com");
    expect(settings.git_user_name).toBe("ada");
  });

  it("prefers the configured git identity over the account", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      email: "ada@example.com",
      git_user_name: "Ada Lovelace",
      git_user_email: "ada@work.dev",
    } satisfies Settings);

    const settings = await getSettingsQueryFn();

    expect(settings.git_user_email).toBe("ada@work.dev");
    expect(settings.git_user_name).toBe("Ada Lovelace");
  });

  it("derives the name from the account when only the git email is set", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      email: "ada@example.com",
      git_user_name: "",
      git_user_email: "grace@navy.mil",
    } satisfies Settings);

    const settings = await getSettingsQueryFn();

    expect(settings.git_user_name).toBe("grace");
  });

  it("keeps the legacy default when no identity is known", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      email: "",
      git_user_name: "",
      git_user_email: "",
    } satisfies Settings);

    const settings = await getSettingsQueryFn();

    expect(settings.git_user_email).toBe(DEFAULT_SETTINGS.git_user_email);
    expect(settings.git_user_name).toBe(DEFAULT_SETTINGS.git_user_name);
  });
});
