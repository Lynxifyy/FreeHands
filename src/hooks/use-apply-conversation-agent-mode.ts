import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import AgentProfilesService, {
  WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME,
} from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useSaveAgentProfile } from "#/hooks/mutation/use-save-agent-profile";
import { useActivateAgentProfile } from "#/hooks/mutation/use-activate-agent-profile";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useActiveBackend } from "#/contexts/active-backend-context";
import AcpService from "#/api/acp-service/acp-service.api";
import { I18nKey } from "#/i18n/declaration";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  builtInAgentSettingsDiff,
  COMPLEX_CODE_PROFILE_NAME,
  complexCodeAgentProfile,
  complexCodeAgentSettingsDiff,
} from "#/utils/complex-code-agent";
import type { ConversationMode } from "#/stores/conversation-store";

export interface ApplyConversationModeResult {
  /** False when neither the profile API nor the settings fallback landed. */
  ok: boolean;
  /** The activated profile id, when the backend has agent profiles. */
  agentProfileId?: string;
}

/**
 * Move the launch default onto the agent a conversation mode implies: OpenCode
 * for "Complex Code", the built-in agent for "Code". Conversations launch from
 * the active AGENT profile (#1571), so the mode switches an agent profile
 * rather than global settings.
 *
 * Returns the activated profile id so a caller that creates a conversation
 * immediately afterwards can pass it explicitly instead of racing the
 * activation pointer. Best-effort: on a backend without `/api/agent-profiles`
 * the profile calls fail, so we fall back to writing the equivalent global
 * `agent_settings` diff. "Plan" is a no-op here — its agent is handled by
 * `useHandlePlanClick`.
 */
export function useApplyConversationAgentMode() {
  const { t } = useTranslation("openhands");
  const saveProfile = useSaveAgentProfile();
  const activateProfile = useActivateAgentProfile();
  const { mutateAsync: saveSettings } = useSaveSettings();
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";

  const activateProfileByName = useCallback(
    async (name: string): Promise<string | null> => {
      const detail = await AgentProfilesService.getProfile(name);
      const id = detail.profile.id;
      if (id) await activateProfile.mutateAsync(id);
      return id ?? null;
    },
    [activateProfile],
  );

  const applyMode = useCallback(
    async (mode: ConversationMode): Promise<ApplyConversationModeResult> => {
      if (mode === "plan") return { ok: true };

      const settingsDiff =
        mode === "complex"
          ? complexCodeAgentSettingsDiff()
          : builtInAgentSettingsDiff();

      try {
        if (mode === "complex") {
          // OpenCode lives on the agent server. Check it before switching so a
          // missing binary or missing credentials becomes an actionable
          // message instead of an opaque launch failure. When the binary is
          // absent but Node is present, `npx` runs the same CLI.
          let runner: "opencode" | "npx" | null = null;
          if (isLocal) {
            const readiness = await AcpService.getOpenCodeReadiness();
            if (readiness.installed === false) {
              displayErrorToast(t(I18nKey.COMPLEX_CODE$OPENCODE_MISSING));
              return { ok: false };
            }
            if (readiness.authenticated === "unauthenticated") {
              displayErrorToast(t(I18nKey.COMPLEX_CODE$OPENCODE_AUTH));
              return { ok: false };
            }
            runner = readiness.runner;
          }
          await saveProfile.mutateAsync({
            name: COMPLEX_CODE_PROFILE_NAME,
            profile: complexCodeAgentProfile(runner),
          });
          if (isLocal) {
            const diagnostics = await AgentProfilesService.materializeProfile(
              COMPLEX_CODE_PROFILE_NAME,
            ).catch(() => null);
            if (diagnostics?.valid === false) {
              displayErrorToast(
                t(I18nKey.COMPLEX_CODE$SWITCH_FAILED, {
                  message:
                    diagnostics.errors.join("; ") || t(I18nKey.ERROR$GENERIC),
                }),
              );
              return { ok: false };
            }
          }
          const id = await activateProfileByName(COMPLEX_CODE_PROFILE_NAME);
          return { ok: !!id, agentProfileId: id ?? undefined };
        }
        const id = await activateProfileByName(
          WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME,
        );
        return { ok: !!id, agentProfileId: id ?? undefined };
      } catch (error) {
        // Complex Code must land on the ACP profile: the global-settings
        // fallback does not move the active profile, so an older backend would
        // silently launch the native OpenHands agent with its key. Fail loudly
        // with the server's own message instead of pretending the mode applied.
        if (mode === "complex") {
          displayErrorToast(
            t(I18nKey.COMPLEX_CODE$SWITCH_FAILED, {
              message:
                retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
            }),
          );
          return { ok: false };
        }
        // Code mode can fall back to global settings on an older backend.
        if (!settingsDiff) return { ok: false };
        try {
          await saveSettings({ agent_settings_diff: settingsDiff });
          return { ok: true };
        } catch (error) {
          displayErrorToast(
            retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
          );
          return { ok: false };
        }
      }
    },
    [activateProfileByName, isLocal, saveProfile, saveSettings, t],
  );

  return {
    applyMode,
    isPending: saveProfile.isPending || activateProfile.isPending,
  };
}
