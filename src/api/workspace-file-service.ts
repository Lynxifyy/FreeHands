import { FileClient } from "@openhands/typescript-client/clients";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { resolveConversationRuntime } from "#/api/conversation-file-upload.api";
import {
  resolveAbsoluteWorkspacePath,
  resolveConversationUploadWorkingDir,
} from "#/api/workspace-upload-path";
import { readCloudConversationFile } from "#/api/cloud/conversation-service.api";

export type WorkspaceFileConversation = Pick<
  AppConversation,
  "id" | "conversation_url" | "session_api_key" | "workspace"
>;

export const MAX_EDITABLE_TEXT_BYTES = 1024 * 1024;

/** The file changed after the editor read its baseline. The caller retains its draft. */
export class WorkspaceFileConflictError extends Error {
  constructor(public readonly remoteText: string) {
    super(
      "This file changed on the server. Review the changes before saving your draft.",
    );
    this.name = "WorkspaceFileConflictError";
  }
}

export function validateWorkspaceRelativePath(path: string): string {
  if (
    !path ||
    path.length > 4096 ||
    Array.from(path).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[a-zA-Z]:/.test(path)
  ) {
    throw new Error("Choose a file inside this conversation's workspace.");
  }
  const normalized = path.replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === ".." || segment === "." || segment === "",
    )
  ) {
    throw new Error(
      "The file path cannot contain empty, '.' or '..' segments.",
    );
  }
  return normalized;
}

export async function resolveWorkspaceFilePath(
  conversation: WorkspaceFileConversation,
  path: string,
): Promise<string> {
  const relativePath = validateWorkspaceRelativePath(path);
  const runtime = await resolveConversationRuntime(
    conversation.id,
    conversation,
  );
  const workingDir = await resolveConversationUploadWorkingDir(
    conversation.id,
    conversation,
  );
  const root = await resolveAbsoluteWorkspacePath(workingDir, runtime);
  return `${root.replace(/\/+$/, "")}/${relativePath}`;
}

/**
 * Read-compare-write through existing typed runtime APIs. This detects changes
 * before an upload, but is NOT an atomic compare-and-swap: the server has no
 * version/etag precondition. Never discard the caller's draft on a conflict.
 * Path validation is lexical, not a server-side sandbox: callers must only pass
 * paths returned by the workspace listing. The API itself accepts absolute paths.
 */
export async function saveWorkspaceFile(
  conversation: WorkspaceFileConversation,
  path: string,
  expectedText: string,
  text: string,
): Promise<void> {
  validateWorkspaceRelativePath(path);
  if (text.includes("\0"))
    throw new Error("Binary files cannot be saved in the code editor.");
  if (new TextEncoder().encode(text).byteLength > MAX_EDITABLE_TEXT_BYTES) {
    throw new Error(
      "This file is too large for the in-app editor (maximum 1 MiB).",
    );
  }
  const destination = await resolveWorkspaceFilePath(conversation, path);
  const runtime = await resolveConversationRuntime(
    conversation.id,
    conversation,
  );
  const client = new FileClient(
    getAgentServerClientOptions({
      ...runtime,
      conversationId: conversation.id,
      timeout: 60000,
    }),
  );
  try {
    const remoteText =
      getActiveBackend().backend.kind === "cloud"
        ? await readCloudConversationFile(conversation.id, destination)
        : await client.downloadTextFile(destination);
    if (remoteText !== expectedText)
      throw new WorkspaceFileConflictError(remoteText);
    await client.uploadTextFile(text, destination, path.split("/").pop());
  } finally {
    client.close();
  }
}
