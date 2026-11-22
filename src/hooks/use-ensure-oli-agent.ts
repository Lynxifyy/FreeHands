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
 * profile once an LLM profile exists. This is what makes Oli the agent that
 * actually answers, instead of the underlying OpenHands persona.
 *
 * Deliberate choices are respected: an active ACP profile or a named custom
 * profile is never replaced. The migration is recorded per backend in
 * `localStorage`, so deleting the Oli profile later does not recreate it on the
 * next load. Cloud is skipped because it does not apply profile persona/tools
 * yet — creating an Oli profile there would only be a label.
 */
const STORAGE_PREFIX = "freehands.oli-agent.ensured";

function storageKey(backendId: string): string {
  return `${STORAGE_PREFIX}.${backendId}`;
}

function readEnsured(backendId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(backendId)) === "1";
  } catch {
    return false;
  }
}

function markEnsured(backendId: string): void {
  try {
    window.localStorage.setItem(storageKey(backendId), "1");
  } catch {
    // Storage unavailable (private mode) — the in-memory ref still prevents a
    // loop within this session.
  }
}

export function useEnsureOliAgent(): void {
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";
  const { data: llmProfiles } = useLlmProfiles();
  const { data: agentProfiles, isError: agentProfilesError } = useAgentProfiles(
    { enabled: isLocal },
  );
  const queryClient = useQueryClient();
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    attemptedRef.current = null;
  }, [backend.id]);

  useEffect(() => {
    if (!isLocal || !llmProfiles || !agentProfiles) return;
    if (agentProfilesError) return;
    if (llmProfiles.profiles.length === 0) return;
    if (attemptedRef.current === backend.id) return;
    if (readEnsured(backend.id)) return;

    const active = agentProfiles.profiles.find(
      (profile) =>
        profile.id != null &&
        profile.id === agentProfiles.active_agent_profile_id,
    );
    if (active && isOliAgentProfileName(active.name)) {
      markEnsured(backend.id);
      attemptedRef.current = backend.id;
      return;
    }
    // Only migrate the baseline / no-selection state. A named custom profile or
    // an ACP agent is a deliberate choice and must not be overridden.
    const isBaseline =
      !active || active.name === WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME;
    if (!isBaseline) {
      markEnsured(backend.id);
      return;
    }

    attemptedRef.current = backend.id;
    void (async () => {
      const result = await ensureOliAgentProfile();
      if (!result.activated) return;
      markEnsured(backend.id);
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
    })();
  }, [
    isLocal,
    llmProfiles,
    agentProfiles,
    agentProfilesError,
    backend.id,
    queryClient,
  ]);
}
