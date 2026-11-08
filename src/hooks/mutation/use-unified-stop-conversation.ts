import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  TOAST_OPTIONS,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { useSettings } from "#/hooks/query/use-settings";
import { ExecutionStatus } from "#/types/agent-server/core";
import {
  pauseConversation,
  patchConversationInCache,
} from "./conversation-mutation-utils";

export const useUnifiedPauseConversation = () => {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { conversationId: currentConversationId, navigate } = useNavigation();

  return useMutation({
    mutationKey: ["stop-conversation"],
    mutationFn: async (variables: { conversationId: string }) =>
      pauseConversation(variables.conversationId, {
        keepSandboxAlive: !!settings?.always_keep_sandbox_alive,
      }),
    onMutate: async () => {
      const toastId = toast.loading(
        t(I18nKey.TOAST$STOPPING_CONVERSATION),
        TOAST_OPTIONS,
      );

      await queryClient.cancelQueries({ queryKey: ["user", "conversations"] });
      const previousConversations = queryClient.getQueryData([
        "user",
        "conversations",
      ]);

      return { previousConversations, toastId };
    },
    onError: (_, __, context) => {
      if (context?.toastId) {
        toast.dismiss(context.toastId);
      }
      displayErrorToast(t(I18nKey.TOAST$FAILED_TO_STOP_CONVERSATION));

      if (context?.previousConversations) {
        queryClient.setQueryData(
          ["user", "conversations"],
          context.previousConversations,
        );
      }
    },
    onSuccess: (data, variables, context) => {
      if (context?.toastId) {
        toast.dismiss(context.toastId);
      }
      toast.success(t(I18nKey.TOAST$CONVERSATION_STOPPED), TOAST_OPTIONS);

      // Drop the runtime URL immediately so this mounted route cannot reconnect
      // to the sandbox being paused. Leave sandbox_status server-authored: the
      // conversation route uses PAUSED as the signal to auto-resume when a user
      // later reopens an already-paused cloud conversation.
      const keptAlive =
        typeof data === "object" && data !== null && "keptAlive" in data
          ? data.keptAlive
          : false;
      patchConversationInCache(queryClient, variables.conversationId, {
        execution_status: ExecutionStatus.PAUSED,
        // "Keep sandboxes alive" keeps the cloud runtime up, so the URL stays
        // valid and a later resume connects directly instead of waking a PAUSED
        // sandbox.
        ...(keptAlive ? {} : { conversation_url: null }),
      });

      if (currentConversationId === variables.conversationId) {
        navigate("/conversations");
      }
    },
  });
};
