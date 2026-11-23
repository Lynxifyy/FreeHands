import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import ToolCatalogService from "#/api/tool-catalog-service/tool-catalog-service.api";
import {
  agentProfileSupportsInstructions,
  agentProfileSupportsTools,
} from "#/api/agent-profiles-service/profile-field-support";
import {
  buildOliAgentProfile,
  filterOliToolsToCatalog,
  isOliAgentProfileName,
  OLI_AGENT_PROFILE_NAME,
  OLI_PERSONA,
  OLI_TOOL_SPECS,
  stripRetiredOliTools,
} from "#/constants/oli-agent";
import type { ProfileToolSpec } from "#/constants/profile-tools";

export interface EnsureOliResult {
  /** The profile the conversation will launch from. */
  name: string;
  /** False when the backend has no agent-profile support or no LLM to bind. */
  activated: boolean;
  /** True when this call created the Oli profile. */
  created: boolean;
  /** Why the profile could not be activated, when `activated` is false. */
  reason?: "no-llm-profile" | "profiles-unavailable" | "unsupported-backend";
}

/**
 * Pick the LLM profile the Oli agent should reference: the user's active LLM
 * profile, else the first profile that has a key, else the first saved profile.
 * Returns `null` when the user has not saved any LLM profile yet.
 */
async function resolveLlmProfileRef(): Promise<string | null> {
  const list = await ProfilesService.listProfiles();
  const active = list.profiles.find(
    (profile) => profile.name === list.active_profile,
  );
  const withKey = list.profiles.find((profile) => profile.api_key_set);
  return active?.name ?? withKey?.name ?? list.profiles[0]?.name ?? null;
}

/**
 * Oli's reviewed tool list, minus anything this server cannot resolve. A name
 * the registry does not know aborts conversation startup, so the catalog is
 * authoritative here; if it cannot be read, the reviewed list is used as-is.
 */
async function resolveOliTools(): Promise<ProfileToolSpec[]> {
  try {
    const catalog = await ToolCatalogService.getCatalog();
    const usable = catalog
      .filter((entry) => entry.usable)
      .map((entry) => entry.name);
    return filterOliToolsToCatalog(OLI_TOOL_SPECS, usable);
  } catch {
    return OLI_TOOL_SPECS;
  }
}

/**
 * Make Oli the active agent profile, creating it on first use.
 *
 * An existing profile named "Oli" is never overwritten — a user's edits win;
 * it is only activated. The profile is bound to the user's active LLM profile so
 * Oli runs on the model they already configured. Best-effort by design: on a
 * backend without `/api/agent-profiles` (or with no LLM profile to reference)
 * it reports `activated: false` and the caller keeps its previous behaviour.
 */
export async function ensureOliAgentProfile(): Promise<EnsureOliResult> {
  // Cloud ignores a profile's persona and tools, so an "Oli" profile there
  // would be a label over the OpenHands agent — exactly the bug this fixes.
  // Only a backend that applies profile instructions can host Oli.
  const includeInstructions = agentProfileSupportsInstructions();
  const includeTools = agentProfileSupportsTools();
  if (!includeInstructions && !includeTools) {
    return {
      name: OLI_AGENT_PROFILE_NAME,
      activated: false,
      created: false,
      reason: "unsupported-backend",
    };
  }

  let llmProfileRef: string | null;
  let list: Awaited<ReturnType<typeof AgentProfilesService.listProfiles>>;
  try {
    [llmProfileRef, list] = await Promise.all([
      resolveLlmProfileRef(),
      AgentProfilesService.listProfiles(),
    ]);
  } catch {
    return {
      name: OLI_AGENT_PROFILE_NAME,
      activated: false,
      created: false,
      reason: "profiles-unavailable",
    };
  }

  const existing = list.profiles.find((profile) =>
    isOliAgentProfileName(profile.name),
  );

  if (existing) {
    // An older "Oli" profile may predate the identity persona (or have been
    // created by hand as a rename of the OpenHands profile). Add the persona
    // and the advanced tool set only where the user has not set their own —
    // that is exactly the profile that still introduced itself as OpenHands.
    if (includeInstructions || includeTools) {
      try {
        const detail = await AgentProfilesService.getProfile(existing.name);
        const profile = detail.profile;
        if (profile.agent_kind === "openhands") {
          const repairedTools = includeTools
            ? stripRetiredOliTools(profile.tools)
            : null;
          const toolsChanged =
            includeTools &&
            profile.tools != null &&
            repairedTools != null &&
            repairedTools.length !== profile.tools.length;
          const needsPersona = includeInstructions && !profile.persona;

          if (needsPersona || toolsChanged) {
            const nextTools = !includeTools
              ? undefined
              : repairedTools == null
                ? await resolveOliTools()
                : repairedTools.length > 0
                  ? repairedTools
                  : null;
            await AgentProfilesService.saveProfile(existing.name, {
              ...profile,
              ...(needsPersona ? { persona: OLI_PERSONA } : {}),
              system_message_suffix: profile.system_message_suffix ?? null,
              ...(nextTools !== undefined ? { tools: nextTools } : {}),
            });
          }
        }
      } catch {
        // Best-effort upgrade; activation below still proceeds.
      }
    }

    if (existing.id && list.active_agent_profile_id !== existing.id) {
      try {
        await AgentProfilesService.activateProfile(existing.id);
      } catch {
        return {
          name: existing.name,
          activated: false,
          created: false,
          reason: "profiles-unavailable",
        };
      }
    }
    return { name: existing.name, activated: true, created: false };
  }

  if (!llmProfileRef) {
    return {
      name: OLI_AGENT_PROFILE_NAME,
      activated: false,
      created: false,
      reason: "no-llm-profile",
    };
  }

  try {
    const profile = buildOliAgentProfile({
      llmProfileRef,
      includeInstructions,
      includeTools,
    });
    if (includeTools && profile.agent_kind === "openhands") {
      profile.tools = await resolveOliTools();
    }
    await AgentProfilesService.saveProfile(OLI_AGENT_PROFILE_NAME, profile);
    const detail = await AgentProfilesService.getProfile(
      OLI_AGENT_PROFILE_NAME,
    );
    if (detail.profile.id) {
      await AgentProfilesService.activateProfile(detail.profile.id);
    }
  } catch {
    return {
      name: OLI_AGENT_PROFILE_NAME,
      activated: false,
      created: false,
      reason: "profiles-unavailable",
    };
  }

  return {
    name: OLI_AGENT_PROFILE_NAME,
    activated: true,
    created: true,
  };
}
