import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExecutionStatus } from "#/types/agent-server/core";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSettings } from "#/hooks/query/use-settings";
import { suppressNextCloudAutoResume } from "#/api/cloud/cloud-sandbox-resume-suppression";
import {
  pauseConversation,
  patchConversationInCache,
} from "./conversation-mutation-utils";

export const usePauseConversation = () => {
  const queryClient = useQueryClient();
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();

  return useMutation({
    mutationFn: (variables: { conversationId: string }) =>
      pauseConversation(variables.conversationId, {
        keepSandboxAlive: !!settings?.always_keep_sandbox_alive,
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["user", "conversations"] });
      const previousConversations = queryClient.getQueryData([
        "user",
        "conversations",
      ]);

      return { previousConversations };
    },
    onError: (_, __, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(
          ["user", "conversations"],
          context.previousConversations,
        );
      }
    },
    onSuccess: (data, variables) => {
      if (backend.kind !== "cloud") return;

      if ("keptAlive" in data && data.keptAlive) {
        // The sandbox is still running; only the agent loop stopped. Keep the
        // runtime URL so a resume connects to the live sandbox directly.
        patchConversationInCache(queryClient, variables.conversationId, {
          execution_status: ExecutionStatus.PAUSED,
        });
        return;
      }

      suppressNextCloudAutoResume(variables.conversationId);
      patchConversationInCache(queryClient, variables.conversationId, {
        execution_status: ExecutionStatus.PAUSED,
        conversation_url: null,
      });
    },
    onSettled: (_, __, variables) => {
      // Invalidate the specific conversation query to trigger automatic refetch
      queryClient.invalidateQueries({
        queryKey: ["user", "conversation", variables.conversationId],
      });
      // Also invalidate the conversations list for consistency
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
      // Invalidate V1 batch get queries
      queryClient.invalidateQueries({
        queryKey: ["v1-batch-get-app-conversations"],
      });
    },
  });
};
