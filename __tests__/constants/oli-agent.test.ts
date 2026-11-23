import { describe, expect, it } from "vitest";
import {
  buildOliAgentProfile,
  filterOliToolsToCatalog,
  isOliAgentProfileName,
  OLI_AGENT_PROFILE_NAME,
  OLI_PERSONA,
  OLI_TOOL_SPECS,
  RETIRED_OLI_TOOL_NAMES,
  stripRetiredOliTools,
} from "#/constants/oli-agent";

describe("buildOliAgentProfile", () => {
  it("binds the profile to the given LLM and carries Oli's identity", () => {
    const profile = buildOliAgentProfile({
      llmProfileRef: "deepseek-v4.1-flash",
      includeInstructions: true,
      includeTools: true,
    });

    expect(profile.agent_kind).toBe("openhands");
    if (profile.agent_kind !== "openhands") throw new Error("wrong variant");
    expect(profile.llm_profile_ref).toBe("deepseek-v4.1-flash");
    expect(profile.persona).toBe(OLI_PERSONA);
    expect(profile.persona).toContain("You are Oli");
    expect(profile.tools).toEqual(OLI_TOOL_SPECS);
    expect(profile.tools?.map((tool) => tool.name)).toEqual([
      "terminal",
      "file_editor",
      "task_tracker",
      "grep",
      "glob",
      "task_tool_set",
      "browser_tool_set",
    ]);
    // A tool the server does not register aborts conversation startup.
    const shipped = profile.tools?.map((tool) => tool.name) ?? [];
    expect(
      shipped.filter((name) => RETIRED_OLI_TOOL_NAMES.includes(name)),
    ).toEqual([]);
  });

  it("omits persona and tools where the backend does not apply them", () => {
    const profile = buildOliAgentProfile({
      llmProfileRef: "gpt-5",
      includeInstructions: false,
      includeTools: false,
    });

    if (profile.agent_kind !== "openhands") throw new Error("wrong variant");
    expect(profile.persona).toBeUndefined();
    expect(profile.tools).toBeUndefined();
    expect(profile.llm_profile_ref).toBe("gpt-5");
  });
});

describe("isOliAgentProfileName", () => {
  it("matches Oli case-insensitively and ignores padding", () => {
    expect(isOliAgentProfileName("Oli")).toBe(true);
    expect(isOliAgentProfileName("  oli ")).toBe(true);
    expect(isOliAgentProfileName("OpenHands")).toBe(false);
    expect(isOliAgentProfileName(null)).toBe(false);
  });

  it("exposes the canonical profile name", () => {
    expect(OLI_AGENT_PROFILE_NAME).toBe("Oli");
  });
});

describe("stripRetiredOliTools", () => {
  it("removes tool names no agent server registers", () => {
    const tools = [
      { name: "terminal", params: {} },
      { name: "file_builder", params: {} },
      { name: "verify", params: {} },
    ];

    expect(stripRetiredOliTools(tools)).toEqual([
      { name: "terminal", params: {} },
    ]);
    expect(stripRetiredOliTools(null)).toBeNull();
  });
});

describe("filterOliToolsToCatalog", () => {
  const tools = [
    { name: "terminal", params: {} },
    { name: "glob", params: {} },
  ];

  it("keeps only names the server reports as usable", () => {
    expect(filterOliToolsToCatalog(tools, ["terminal"])).toEqual([
      { name: "terminal", params: {} },
    ]);
  });

  it("falls back to the reviewed list when nothing matches", () => {
    expect(filterOliToolsToCatalog(tools, [])).toEqual(tools);
  });
});
