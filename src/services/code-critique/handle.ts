import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import {
  CODE_CRITIQUE_LEDGER_PREFIX,
  CODE_CRITIQUE_RESULT_PREFIX,
} from "#/constants/code-critique";
import type { CodeCritiqueAction } from "#/types/agent-server/core";
import { claimClientToolCall } from "#/utils/claim-client-tool-call";
import { getGitPath } from "#/utils/get-git-path";
import { postClientToolResult } from "#/services/client-tool-result";
import { useCodeToolsSettingsStore } from "#/stores/code-tools-settings-store";
import { critiqueCode } from "./critique";

interface CritiqueErrorResult {
  verdict: "error";
  summary: string;
  language: "unknown";
  issues: [];
}

function errorResult(summary: string): CritiqueErrorResult {
  return { verdict: "error", summary, language: "unknown", issues: [] };
}

/** Absolute workspace path for the tool's workspace-relative `path` argument. */
function toAbsolutePath(relativePath: string): string {
  const conversation = ConversationService.getCurrentConversation();
  const workingDir = conversation?.workspace?.working_dir;
  const root = getGitPath(conversation?.selected_repository, workingDir);
  const normalizedRoot = root.startsWith("/") ? root : `/${root}`;
  return `${normalizedRoot}/${relativePath.replace(/^\/+/, "")}`;
}

async function readWorkspaceFile(relativePath: string): Promise<string> {
  const conversation = ConversationService.getCurrentConversation();
  const buffer = await AgentServerRuntimeService.downloadFile(
    conversation?.conversation_url,
    conversation?.session_api_key,
    toAbsolutePath(relativePath),
  );
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/**
 * Execute a `code_critique` tool call.
 *
 * Never rejects: a malformed call or a failed file read is turned into
 * corrective guidance for the agent, because the agent-server has already told
 * it the call succeeded. The critique itself is a pure static analysis and is
 * reported with the same prefix either way.
 */
export async function handleCodeCritiqueAction(
  action: CodeCritiqueAction,
  conversationId: string,
  toolCallId: string,
): Promise<void> {
  // Static and read-only, but a replay would still re-post the findings.
  if (
    !claimClientToolCall(
      `${CODE_CRITIQUE_LEDGER_PREFIX}${conversationId}`,
      toolCallId,
    )
  ) {
    return;
  }

  const inlineCode = action.code?.trim();
  const path = action.path?.trim();
  const strictness = useCodeToolsSettingsStore.getState().critiqueStrictness;

  let result: unknown;
  if (inlineCode) {
    result = critiqueCode({
      path: path ?? "snippet",
      content: action.code ?? "",
      language: action.language ?? undefined,
      strictness,
    });
  } else if (path) {
    try {
      const content = await readWorkspaceFile(path);
      result = critiqueCode({
        path,
        content,
        language: action.language ?? undefined,
        strictness,
      });
    } catch (error) {
      result = errorResult(
        `Could not read "${path}": ${
          error instanceof Error ? error.message : String(error)
        }. Check the path is workspace-relative and the file exists.`,
      );
    }
  } else {
    result = errorResult(
      "Provide either `path` (a workspace-relative file) or `code` (an inline snippet) to review.",
    );
  }

  await postClientToolResult(
    conversationId,
    CODE_CRITIQUE_RESULT_PREFIX,
    result,
  ).catch((error) => {
    console.warn(
      "[code_critique] Failed to report the critique result:",
      error,
    );
  });
}
