import { describe, expect, it } from "vitest";
import {
  builtInAgentSettingsDiff,
  COMPLEX_CODE_AGENT_PROVIDER,
  COMPLEX_CODE_PROFILE_NAME,
  complexCodeAgentProfile,
  complexCodeAgentSettingsDiff,
} from "#/utils/complex-code-agent";

describe("complex code agent", () => {
  it("runs the OpenCode ACP provider", () => {
    expect(COMPLEX_CODE_AGENT_PROVIDER).toBe("opencode");
  });

  it("names a dedicated profile so mode switches never clobber the default", () => {
    expect(COMPLEX_CODE_PROFILE_NAME).not.toBe("default");
    expect(COMPLEX_CODE_PROFILE_NAME.toLowerCase()).toContain("opencode");
  });

  it("builds an ACP profile that can launch without a global binary", () => {
    const profile = complexCodeAgentProfile();

    expect(profile).toMatchObject({
      agent_kind: "acp",
      acp_server: "opencode",
      acp_command: "npx",
      acp_args: expect.arrayContaining(["acp"]),
    });
    expect(profile).not.toHaveProperty("acp_model");
  });

  it("launches the global binary when the probe found it", () => {
    expect(complexCodeAgentProfile("opencode")).toMatchObject({
      acp_command: "opencode",
      acp_args: ["acp"],
    });
  });

  it("builds the matching agent-settings diff fallback", () => {
    expect(complexCodeAgentSettingsDiff()).toMatchObject({
      agent_kind: "acp",
      acp_server: "opencode",
    });
  });

  it("builds the built-in agent diff for leaving complex mode", () => {
    expect(builtInAgentSettingsDiff()).toEqual({ agent_kind: "openhands" });
  });
});
