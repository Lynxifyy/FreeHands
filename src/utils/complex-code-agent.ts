import type { AgentProfileSaveInput } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { buildAcpAgentSettingsDiff } from "#/constants/acp-providers";

/**
 * The ACP provider the "Complex Code" mode runs on — a professional coding
 * agent used for hard, multi-file work.
 */
export const COMPLEX_CODE_AGENT_PROVIDER = "opencode";

/**
 * Agent-profile name the Complex Code mode upserts and activates, so the next
 * conversation launches on OpenCode. Kept distinct from the seeded `default`
 * profile so switching modes never clobbers the user's own profile choice.
 */
export const COMPLEX_CODE_PROFILE_NAME = "Complex Code (OpenCode)";

/**
 * The ACP agent-profile body that makes a conversation run on OpenCode. All
 * optional fields are left unset so the agent-server applies its own defaults;
 * the provider key is the only identity that matters.
 */
export function complexCodeAgentProfile(): AgentProfileSaveInput {
  return {
    agent_kind: "acp",
    acp_server: COMPLEX_CODE_AGENT_PROVIDER,
  };
}

/**
 * The agent-settings diff equivalent of {@link complexCodeAgentProfile}, used
 * as a fallback on backends where agent profiles aren't available.
 */
export function complexCodeAgentSettingsDiff(): Record<string, unknown> | null {
  return buildAcpAgentSettingsDiff(COMPLEX_CODE_AGENT_PROVIDER);
}

/** The agent-settings diff that returns a conversation to the built-in agent. */
export function builtInAgentSettingsDiff(): Record<string, unknown> | null {
  return buildAcpAgentSettingsDiff("openhands");
}
