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

  it("builds an ACP profile for OpenCode", () => {
    expect(complexCodeAgentProfile()).toEqual({
      agent_kind: "acp",
      acp_server: "opencode",
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
