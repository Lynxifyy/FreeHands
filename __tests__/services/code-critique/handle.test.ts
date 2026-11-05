import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleCodeCritiqueAction } from "#/services/code-critique/handle";
import type { CodeCritiqueAction } from "#/types/agent-server/core";

const downloadFileMock = vi.fn();
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    downloadFile: (url: unknown, key: unknown, path: unknown) =>
      downloadFileMock(url, key, path),
  },
}));

const postClientToolResultMock = vi.fn(
  async (_conversationId: string, _prefix: string, _result: unknown) => {},
);
vi.mock("#/services/client-tool-result", () => ({
  postClientToolResult: (
    conversationId: string,
    prefix: string,
    result: unknown,
  ) => postClientToolResultMock(conversationId, prefix, result),
}));

const getCurrentConversationMock = vi.fn();
vi.mock("#/api/conversation-service/conversation-service.api", () => ({
  default: {
    getCurrentConversation: () => getCurrentConversationMock(),
  },
}));

const CONVERSATION = "conv-1";

function action(overrides: Partial<CodeCritiqueAction>): CodeCritiqueAction {
  return {
    kind: "ClientAction_code_critique",
    ...overrides,
  } as CodeCritiqueAction;
}

function postedResult(): Record<string, unknown> {
  const calls = postClientToolResultMock.mock.calls;
  const last = calls[calls.length - 1] as unknown[] | undefined;
  return (last?.[2] ?? {}) as Record<string, unknown>;
}

describe("handleCodeCritiqueAction", () => {
  beforeEach(() => {
    localStorage.clear();
    downloadFileMock.mockReset();
    postClientToolResultMock.mockClear();
    getCurrentConversationMock.mockReset();
    getCurrentConversationMock.mockReturnValue({
      id: CONVERSATION,
      conversation_url: "https://agent.example.com/api/conversations/conv-1",
      session_api_key: "key",
      workspace: { working_dir: "/workspace/project" },
    });
    downloadFileMock.mockResolvedValue(
      new TextEncoder().encode("<div><p>hi</div>").buffer,
    );
  });

  it("critiques inline code without reading a file", async () => {
    await handleCodeCritiqueAction(
      action({ code: "export const answer = 42;", language: "typescript" }),
      CONVERSATION,
      "call-1",
    );

    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(postClientToolResultMock).toHaveBeenCalledTimes(1);
    expect(postedResult()).toMatchObject({
      verdict: "pass",
      language: "typescript",
    });
  });

  it("reads the workspace file for a path and critiques its contents", async () => {
    await handleCodeCritiqueAction(
      action({ path: "app/src/index.html" }),
      CONVERSATION,
      "call-2",
    );

    expect(downloadFileMock).toHaveBeenCalledWith(
      "https://agent.example.com/api/conversations/conv-1",
      "key",
      "/workspace/project/app/src/index.html",
    );
    const result = postedResult() as { verdict: string; issues: unknown[] };
    expect(result.verdict).toBe("fail");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("prefers inline code when both path and code are given", async () => {
    await handleCodeCritiqueAction(
      action({ path: "app/src/index.html", code: "export const x = 1;" }),
      CONVERSATION,
      "call-3",
    );

    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(postedResult()).toMatchObject({ verdict: "pass" });
  });

  it("reports corrective guidance when neither path nor code is supplied", async () => {
    await handleCodeCritiqueAction(action({}), CONVERSATION, "call-4");

    const result = postedResult() as { verdict: string; summary: string };
    expect(result.verdict).toBe("error");
    expect(result.summary).toMatch(/path.*code|code.*path/i);
  });

  it("reports a read failure as guidance instead of throwing", async () => {
    downloadFileMock.mockRejectedValue(new Error("404"));

    await handleCodeCritiqueAction(
      action({ path: "missing.html" }),
      CONVERSATION,
      "call-5",
    );

    const result = postedResult() as { verdict: string; summary: string };
    expect(result.verdict).toBe("error");
    expect(result.summary).toContain("404");
  });

  it("acts on a replayed tool call only once", async () => {
    await handleCodeCritiqueAction(
      action({ code: "x" }),
      CONVERSATION,
      "call-6",
    );
    await handleCodeCritiqueAction(
      action({ code: "x" }),
      CONVERSATION,
      "call-6",
    );

    expect(postClientToolResultMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleCodeCritiqueAction strictness", () => {
  it("honours the stored strictness setting", async () => {
    const { useCodeToolsSettingsStore } =
      await import("#/stores/code-tools-settings-store");
    useCodeToolsSettingsStore.setState({ critiqueStrictness: "relaxed" });

    await handleCodeCritiqueAction(
      action({ code: '<img src="a.png">', language: "html" }),
      CONVERSATION,
      "call-relaxed",
    );

    expect(postedResult()).toMatchObject({ verdict: "pass" });

    useCodeToolsSettingsStore.setState({ critiqueStrictness: "normal" });
  });
});
