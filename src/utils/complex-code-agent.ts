import type { AgentProfileSaveInput } from "#/api/agent-profiles-service/agent-profiles-service.api";
import {
  buildAcpAgentSettingsDiff,
  getAcpPreferredDefaultModel,
  getAcpProvider,
} from "#/constants/acp-providers";

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
 * The ACP agent-profile body that makes a conversation run on OpenCode. The
 * launch command is written explicitly so a backend without the global
 * `opencode` binary can still start it through `npx`.
 */
export const OPENCODE_NPX_PACKAGE = "opencode-ai@1.18.23";

/**
 * How the agent-server should launch OpenCode. `npx` runs the same CLI
 * without a global install, so Complex Code works on a machine that has Node
 * but not the `opencode` binary.
 */
export type OpenCodeRunner = "opencode" | "npx" | null;

export function complexCodeAgentProfile(
  runner: OpenCodeRunner = null,
): AgentProfileSaveInput {
  const provider = getAcpProvider(COMPLEX_CODE_AGENT_PROVIDER);
  const command =
    runner === "npx"
      ? ["npx", "-y", OPENCODE_NPX_PACKAGE, "acp"]
      : runner === "opencode"
        ? ["opencode", "acp"]
        : (provider?.default_command ?? []);
  const preferredModel = getAcpPreferredDefaultModel(
    COMPLEX_CODE_AGENT_PROVIDER,
  );
  return {
    agent_kind: "acp",
    acp_server: COMPLEX_CODE_AGENT_PROVIDER,
    ...(command.length
      ? { acp_command: command[0], acp_args: command.slice(1) }
      : {}),
    ...(preferredModel ? { acp_model: preferredModel } : {}),
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
