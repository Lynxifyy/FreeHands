import { describe, expect, it } from "vitest";
import {
  buildOliAgentProfile,
  isOliAgentProfileName,
  OLI_AGENT_PROFILE_NAME,
  OLI_PERSONA,
  OLI_TOOL_SPECS,
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
    expect(profile.tools?.map((tool) => tool.name)).toContain("file_builder");
    expect(profile.tools?.map((tool) => tool.name)).toContain("task_tool_set");
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
