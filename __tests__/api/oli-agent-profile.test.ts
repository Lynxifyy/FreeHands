import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  activateProfile: vi.fn(),
  listLlmProfiles: vi.fn(),
  supportsInstructions: vi.fn(() => true),
  supportsTools: vi.fn(() => true),
}));

vi.mock("#/api/agent-profiles-service/agent-profiles-service.api", () => ({
  default: {
    listProfiles: mocks.listProfiles,
    getProfile: mocks.getProfile,
    saveProfile: mocks.saveProfile,
    activateProfile: mocks.activateProfile,
  },
}));

vi.mock("#/api/profiles-service/profiles-service.api", () => ({
  default: { listProfiles: mocks.listLlmProfiles },
}));

vi.mock("#/api/agent-profiles-service/profile-field-support", () => ({
  agentProfileSupportsInstructions: mocks.supportsInstructions,
  agentProfileSupportsTools: mocks.supportsTools,
}));

import { ensureOliAgentProfile } from "#/api/agent-profiles-service/oli-agent-profile";
import { OLI_PERSONA, OLI_TOOL_SPECS } from "#/constants/oli-agent";

const summary = (overrides: Record<string, unknown>) => ({
  id: "id-1",
  name: "default",
  agent_kind: "openhands",
  revision: 1,
  llm_profile_ref: "deepseek",
  mcp_server_refs: null,
  ...overrides,
});

const llmProfiles = (active: string | null, names: string[]) => ({
  profiles: names.map((name) => ({ name, api_key_set: true })),
  active_profile: active,
});

describe("ensureOliAgentProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supportsInstructions.mockReturnValue(true);
    mocks.supportsTools.mockReturnValue(true);
  });

  it("activates an existing Oli profile without overwriting it", async () => {
    mocks.listLlmProfiles.mockResolvedValue(
      llmProfiles("deepseek", ["deepseek"]),
    );
    mocks.listProfiles.mockResolvedValue({
      profiles: [summary({ id: "oli-id", name: "Oli" })],
      active_agent_profile_id: "other-id",
    });
    mocks.activateProfile.mockResolvedValue({ id: "oli-id" });

    const result = await ensureOliAgentProfile();

    expect(result).toEqual({
      name: "Oli",
      activated: true,
      created: false,
    });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    expect(mocks.activateProfile).toHaveBeenCalledWith("oli-id");
  });

  it("reports no-llm-profile when the user has not saved one", async () => {
    mocks.listLlmProfiles.mockResolvedValue(llmProfiles(null, []));
    mocks.listProfiles.mockResolvedValue({
      profiles: [],
      active_agent_profile_id: null,
    });

    const result = await ensureOliAgentProfile();

    expect(result.reason).toBe("no-llm-profile");
    expect(result.activated).toBe(false);
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it("creates and activates Oli bound to the active LLM profile", async () => {
    mocks.listLlmProfiles.mockResolvedValue(
      llmProfiles("deepseek", ["deepseek"]),
    );
    mocks.listProfiles.mockResolvedValue({
      profiles: [summary({ id: "default-id", name: "default" })],
      active_agent_profile_id: "default-id",
    });
    mocks.saveProfile.mockResolvedValue({ name: "Oli", message: "saved" });
    mocks.getProfile.mockResolvedValue({
      name: "Oli",
      profile: { id: "oli-id", agent_kind: "openhands", name: "Oli" },
    });
    mocks.activateProfile.mockResolvedValue({ id: "oli-id" });

    const result = await ensureOliAgentProfile();

    expect(result).toEqual({ name: "Oli", activated: true, created: true });
    expect(mocks.saveProfile).toHaveBeenCalledWith(
      "Oli",
      expect.objectContaining({
        agent_kind: "openhands",
        llm_profile_ref: "deepseek",
      }),
    );
    expect(mocks.activateProfile).toHaveBeenCalledWith("oli-id");
  });

  it("adds Oli's persona to an existing Oli profile that lacks one", async () => {
    mocks.listLlmProfiles.mockResolvedValue(
      llmProfiles("deepseek", ["deepseek"]),
    );
    mocks.listProfiles.mockResolvedValue({
      profiles: [summary({ id: "oli-id", name: "Oli" })],
      active_agent_profile_id: "oli-id",
    });
    mocks.getProfile.mockResolvedValue({
      name: "Oli",
      profile: {
        id: "oli-id",
        name: "Oli",
        agent_kind: "openhands",
        revision: 1,
        schema_version: 3,
        llm_profile_ref: "deepseek",
        mcp_server_refs: null,
        skills: [],
        condenser: null,
        verification: {},
        tool_concurrency_limit: 1,
        persona: null,
        system_message_suffix: null,
        tools: null,
      },
    });

    const result = await ensureOliAgentProfile();

    expect(result.activated).toBe(true);
    expect(mocks.saveProfile).toHaveBeenCalledWith(
      "Oli",
      expect.objectContaining({
        llm_profile_ref: "deepseek",
        persona: OLI_PERSONA,
        tools: OLI_TOOL_SPECS,
      }),
    );
  });

  it("does not replace a persona the user already set on Oli", async () => {
    mocks.listLlmProfiles.mockResolvedValue(
      llmProfiles("deepseek", ["deepseek"]),
    );
    mocks.listProfiles.mockResolvedValue({
      profiles: [summary({ id: "oli-id", name: "Oli" })],
      active_agent_profile_id: "oli-id",
    });
    mocks.getProfile.mockResolvedValue({
      name: "Oli",
      profile: {
        id: "oli-id",
        name: "Oli",
        agent_kind: "openhands",
        llm_profile_ref: "deepseek",
        persona: "You are a custom assistant.",
        tools: null,
      },
    });

    await ensureOliAgentProfile();

    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it("reports profiles-unavailable when the backend has no profile API", async () => {
    mocks.listLlmProfiles.mockRejectedValue(new Error("404"));
    mocks.listProfiles.mockRejectedValue(new Error("404"));

    const result = await ensureOliAgentProfile();

    expect(result.reason).toBe("profiles-unavailable");
    expect(result.activated).toBe(false);
  });

  it("skips backends that ignore profile instructions and tools", async () => {
    mocks.supportsInstructions.mockReturnValue(false);
    mocks.supportsTools.mockReturnValue(false);

    const result = await ensureOliAgentProfile();

    expect(result.reason).toBe("unsupported-backend");
    expect(mocks.listProfiles).not.toHaveBeenCalled();
    expect(mocks.saveProfile).not.toHaveBeenCalled();

    mocks.supportsInstructions.mockReturnValue(true);
    mocks.supportsTools.mockReturnValue(true);
  });
});
