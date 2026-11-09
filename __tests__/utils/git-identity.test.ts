import { describe, expect, it } from "vitest";
import {
  gitNameFromEmail,
  resolveGitUserEmail,
  resolveGitUserName,
} from "#/utils/git-identity";

describe("gitNameFromEmail", () => {
  it("takes the local part of an address", () => {
    expect(gitNameFromEmail("ada@example.com")).toBe("ada");
  });

  it("ignores blank and missing addresses", () => {
    expect(gitNameFromEmail("")).toBeNull();
    expect(gitNameFromEmail("   ")).toBeNull();
    expect(gitNameFromEmail(null)).toBeNull();
    expect(gitNameFromEmail(undefined)).toBeNull();
  });
});

describe("resolveGitUserEmail", () => {
  it("prefers the configured git email", () => {
    expect(
      resolveGitUserEmail({
        configuredEmail: "ada@work.dev",
        accountEmail: "ada@example.com",
      }),
    ).toBe("ada@work.dev");
  });

  it("falls back to the account email", () => {
    expect(resolveGitUserEmail({ accountEmail: "ada@example.com" })).toBe(
      "ada@example.com",
    );
  });

  it("returns null when nothing is known", () => {
    expect(resolveGitUserEmail({})).toBeNull();
  });
});

describe("resolveGitUserName", () => {
  it("prefers the configured name", () => {
    expect(
      resolveGitUserName({
        configuredName: "Ada Lovelace",
        accountEmail: "ada@example.com",
      }),
    ).toBe("Ada Lovelace");
  });

  it("derives from the configured email when no name is set", () => {
    expect(
      resolveGitUserName({
        configuredEmail: "grace@navy.mil",
        accountEmail: "ada@example.com",
      }),
    ).toBe("grace");
  });

  it("derives from the account email as a last resort", () => {
    expect(resolveGitUserName({ accountEmail: "ada@example.com" })).toBe("ada");
  });

  it("returns null when nothing is known", () => {
    expect(resolveGitUserName({})).toBeNull();
  });
});
