import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import AgentProfilesService, {
  WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME,
} from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useSaveAgentProfile } from "#/hooks/mutation/use-save-agent-profile";
import { useActivateAgentProfile } from "#/hooks/mutation/use-activate-agent-profile";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
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

/**
 * Move the launch default onto the agent a conversation mode implies: OpenCode
 * for "Complex Code", the built-in agent for "Code". Conversations launch from
 * the active AGENT profile (#1571), so the mode switches an agent profile rather
 * than global settings.
 *
 * Best-effort: on a backend without `/api/agent-profiles` the profile calls
 * fail, so we fall back to writing the equivalent global `agent_settings` diff
 * and only surface a toast when even that fails. "Plan" is a no-op here — its
 * agent is handled by `useHandlePlanClick`.
 */
export function useApplyConversationAgentMode() {
  const { t } = useTranslation("openhands");
  const saveProfile = useSaveAgentProfile();
  const activateProfile = useActivateAgentProfile();
  const { mutateAsync: saveSettings } = useSaveSettings();

  const activateProfileByName = useCallback(
    async (name: string) => {
      const detail = await AgentProfilesService.getProfile(name);
      const id = detail.profile.id;
      if (id) await activateProfile.mutateAsync(id);
    },
    [activateProfile],
  );

  const applyMode = useCallback(
    async (mode: ConversationMode) => {
      if (mode === "plan") return;

      const settingsDiff =
        mode === "complex"
          ? complexCodeAgentSettingsDiff()
          : builtInAgentSettingsDiff();

      try {
        if (mode === "complex") {
          await saveProfile.mutateAsync({
            name: COMPLEX_CODE_PROFILE_NAME,
            profile: complexCodeAgentProfile(),
          });
          await activateProfileByName(COMPLEX_CODE_PROFILE_NAME);
        } else {
          await activateProfileByName(WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME);
        }
      } catch {
        // Older backend without agent profiles — fall back to global settings.
        if (settingsDiff) {
          try {
            await saveSettings({ agent_settings_diff: settingsDiff });
          } catch (error) {
            displayErrorToast(
              retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
            );
          }
        }
      }
    },
    [activateProfileByName, saveProfile, saveSettings, t],
  );

  return {
    applyMode,
    isPending: saveProfile.isPending || activateProfile.isPending,
  };
}
