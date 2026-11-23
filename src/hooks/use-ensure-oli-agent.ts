import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { AGENT_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";
import { ensureOliAgentProfile } from "#/api/agent-profiles-service/oli-agent-profile";
import { WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { isOliAgentProfileName } from "#/constants/oli-agent";

/**
 * Local-mode UX policy: FreeHands' built-in agent is Oli, so an install that is
 * still on the seeded `default` OpenHands profile is migrated onto the Oli
 * profile once an LLM profile exists. Re-running when the active LLM profile
 * changes is deliberate: selecting a new model must also move Oli onto that
 * model, not leave it pinned to a stale profile.
 *
 * Deliberate choices are respected: an active ACP profile or a named custom
 * profile is never replaced. Cloud is skipped because it does not apply profile
 * persona/tools yet — creating an Oli profile there would only be a label.
 */
export function useEnsureOliAgent(): void {
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";
  const { data: llmProfiles } = useLlmProfiles();
  const { data: agentProfiles, isError: agentProfilesError } = useAgentProfiles(
    { enabled: isLocal },
  );
  const queryClient = useQueryClient();
  const attemptedRef = useRef<string | null>(null);

  const activeLlmProfile = llmProfiles?.active_profile ?? null;
  const attemptKey = `${backend.id}:${activeLlmProfile ?? ""}`;

  useEffect(() => {
    attemptedRef.current = null;
  }, [backend.id, activeLlmProfile]);

  useEffect(() => {
    if (!isLocal || !llmProfiles || !agentProfiles) return;
    if (agentProfilesError) return;
    if (llmProfiles.profiles.length === 0) return;
    if (attemptedRef.current === attemptKey) return;

    const active = agentProfiles.profiles.find(
      (profile) =>
        profile.id != null &&
        profile.id === agentProfiles.active_agent_profile_id,
    );
    if (active && isOliAgentProfileName(active.name)) {
      attemptedRef.current = attemptKey;
      return;
    }
    // Only migrate the baseline / no-selection state. A named custom profile or
    // an ACP agent is a deliberate choice and must not be overridden.
    const isBaseline =
      !active || active.name === WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME;
    if (!isBaseline) {
      attemptedRef.current = attemptKey;
      return;
    }

    attemptedRef.current = attemptKey;
    void (async () => {
      const result = await ensureOliAgentProfile();
      if (!result.activated) return;
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
    })();
  }, [
    isLocal,
    llmProfiles,
    agentProfiles,
    agentProfilesError,
    attemptKey,
    queryClient,
  ]);
}
