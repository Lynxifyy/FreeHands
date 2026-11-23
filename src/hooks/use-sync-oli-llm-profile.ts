import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveAgentProfile } from "#/hooks/use-active-agent-profile";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { AGENT_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { isOliAgentProfileName } from "#/constants/oli-agent";

/**
 * Keep Oli on the LLM profile the user actually selected.
 *
 * Agent profiles store a concrete `llm_profile_ref`. Without this, choosing a
 * new model (for example `deepseek-v4.1-flash`) leaves Oli pinned to the old
 * profile — and to its old, possibly expired, API key. Whenever the active LLM
 * profile changes and Oli is the active agent, rewrite only Oli's ref, keeping
 * every other profile field intact.
 */
export function useSyncOliLlmProfile(): void {
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";
  const { activeProfile } = useActiveAgentProfile();
  const { data: llmProfiles } = useLlmProfiles();
  const queryClient = useQueryClient();
  const syncingRef = useRef<string | null>(null);

  const activeLlm = llmProfiles?.active_profile ?? null;
  const oliActive =
    !!activeProfile && isOliAgentProfileName(activeProfile.name);
  const needsSync =
    isLocal &&
    oliActive &&
    !!activeLlm &&
    activeProfile?.llm_profile_ref !== activeLlm;
  const syncKey = `${backend.id}:${activeProfile?.id ?? ""}:${activeLlm ?? ""}`;

  useEffect(() => {
    if (!needsSync || !activeProfile || !activeLlm) return;
    if (syncingRef.current === syncKey) return;
    syncingRef.current = syncKey;

    void (async () => {
      try {
        const detail = await AgentProfilesService.getProfile(
          activeProfile.name,
        );
        if (detail.profile.agent_kind !== "openhands") return;
        if (detail.profile.llm_profile_ref === activeLlm) return;
        await AgentProfilesService.saveProfile(activeProfile.name, {
          ...detail.profile,
          llm_profile_ref: activeLlm,
        });
        await queryClient.invalidateQueries({
          queryKey: AGENT_PROFILES_QUERY_KEYS.all,
        });
      } catch {
        // Best-effort: a failed sync must not break the app; the next LLM
        // change or launch resolves the active profile again.
      }
    })();
  }, [needsSync, activeProfile, activeLlm, syncKey, queryClient]);
}
