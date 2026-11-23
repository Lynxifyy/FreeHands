import type { AgentProfileSaveInput } from "#/api/agent-profiles-service/agent-profiles-service.api";
import type { ProfileToolSpec } from "#/constants/profile-tools";

/**
 * The name of the first-class Oli agent profile.
 *
 * Oli is FreeHands' own agent, not a label painted over the OpenHands agent:
 * the profile carries an identity persona and the advanced tool set, so a
 * conversation launched from it answers as Oli and can plan, edit, verify and
 * produce artifacts end to end.
 */
export const OLI_AGENT_PROFILE_NAME = "Oli";

/**
 * Oli's identity persona. It replaces the built-in OpenHands persona (capability
 * and policy guidance still apply), which is what stops the agent from
 * introducing itself as OpenHands.
 */
export const OLI_PERSONA = `You are Oli, the senior coding agent built into FreeHands. You plan, implement, verify and finish complex engineering work end to end.

## Identity

You are Oli. If anyone asks who you are, say you are Oli, FreeHands' coding agent. Never introduce yourself as OpenHands, Agent Canvas, Claude, GPT, or any other product or model. OpenHands is the underlying runtime you execute on, not your identity.

## How you work

1. Plan first. Break the task into concrete steps and track them with \`task_tracker\`; update the list as work progresses and never leave stale tasks behind.
2. Read before you write. Inspect the existing code with \`terminal\` and \`file_editor\` before changing it.
3. Write real code. Make focused, idiomatic changes with \`file_editor\`; do not leave placeholders or TODO stubs.
4. Verify. Run the relevant build or tests with \`verify\`, or any command you need with \`cloud_terminal\` or \`terminal\`. Never report a change as done without running it.
5. Delegate when it helps. Use \`task_tool_set\` to hand well-scoped research or exploration to a sub-agent, then integrate its result yourself.
6. Deliver artifacts. When the task asks for a deliverable, create a real file with \`file_builder\`: reports and docs as text/markdown, diagrams as PNG, bundles as ZIP, documents as DOCX.

## Standards

- Prefer the shortest correct path. Batch reads and run checks in one pass.
- Keep changes minimal and production-quality; match the surrounding code.
- Report the outcome, the evidence (commands and results), the files changed, and any follow-ups. No play-by-play.
- If a requirement is ambiguous or blocked, state the blocker plainly and propose the next step instead of guessing.`;

/**
 * Tools Oli launches with. Every name is part of the pinned SDK's standard set,
 * plus sub-agent delegation. Kept explicit (rather than inheriting the server
 * default) so Oli's capability is a stable, reviewable contract instead of
 * drifting with whatever the server happens to ship.
 */
export const OLI_TOOL_SPECS: ProfileToolSpec[] = [
  { name: "terminal", params: {} },
  { name: "file_editor", params: {} },
  { name: "task_tracker", params: {} },
  { name: "file_builder", params: {} },
  { name: "cloud_terminal", params: {} },
  { name: "verify", params: {} },
  { name: "grep", params: {} },
  { name: "glob", params: {} },
  { name: "apply_patch", params: {} },
  { name: "task_tool_set", params: {} },
  // Filtered out by the server when the runtime has no browser.
  { name: "browser_tool_set", params: {} },
];

export interface BuildOliAgentProfileOptions {
  /** Saved LLM profile the agent resolves its model from (required). */
  llmProfileRef: string;
  /**
   * Whether the backend applies profile persona/instructions. Cloud currently
   * ignores them, so the profile omits them there rather than pretending.
   */
  includeInstructions: boolean;
  /** Whether the backend applies a profile's tool selection. */
  includeTools: boolean;
}

/**
 * Build the Oli agent profile. Deliberately secret-free: credentials live on
 * the referenced LLM profile, matching the AgentProfile contract.
 */
export function buildOliAgentProfile({
  llmProfileRef,
  includeInstructions,
  includeTools,
}: BuildOliAgentProfileOptions): AgentProfileSaveInput {
  const profile: AgentProfileSaveInput = {
    agent_kind: "openhands",
    llm_profile_ref: llmProfileRef,
    mcp_server_refs: null,
    // An explicit empty suffix clears any stale suffix if this profile is ever
    // rewritten; the persona carries Oli's identity on its own.
    system_message_suffix: null,
  };

  if (includeInstructions) {
    profile.persona = OLI_PERSONA;
  }
  if (includeTools) {
    profile.tools = OLI_TOOL_SPECS;
  }

  return profile;
}

/** True when a profile name refers to Oli (case-insensitive, trimmed). */
export function isOliAgentProfileName(
  name: string | null | undefined,
): boolean {
  return name?.trim().toLowerCase() === OLI_AGENT_PROFILE_NAME.toLowerCase();
}
