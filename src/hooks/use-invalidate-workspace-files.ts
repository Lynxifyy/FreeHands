import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

/** Refresh every view affected by a user save, just as for an agent file edit. */
export function useInvalidateWorkspaceFiles() {
  const queryClient = useQueryClient();
  const bump = useWorkspaceMutationCounter((state) => state.bump);
  return useCallback(
    (_conversationId: string, _workingDir?: string) => {
      for (const key of [
        "workspace-files",
        "workspace-file-content",
        "file_changes",
        "file_diff",
        "git_commits",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      bump();
    },
    [queryClient, bump],
  );
}
