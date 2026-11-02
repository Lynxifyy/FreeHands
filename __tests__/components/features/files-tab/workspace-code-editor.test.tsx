import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import { WorkspaceCodeEditor } from "#/components/features/files-tab/workspace-code-editor";
import { WorkspaceFileConflictError } from "#/api/workspace-file-service";
import { useCodeEditorStore } from "#/stores/code-editor-store";
import { appendConversationCodeContext } from "#/utils/conversation-local-storage";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  editor: null as any,
}));
vi.mock("#/api/workspace-file-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/api/workspace-file-service")>()),
  saveWorkspaceFile: mocks.save,
}));
vi.mock("#/hooks/use-invalidate-workspace-files", () => ({
  useInvalidateWorkspaceFiles: () => mocks.invalidate,
}));
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: mocks.toast,
}));
vi.mock("#/utils/monaco-loader", () => ({
  useMonaco: () => ({
    monaco: { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49 } },
    error: null,
  }),
}));
vi.mock("@monaco-editor/react", () => ({
  DiffEditor: () => <div data-testid="monaco-diff" />,
  default: ({ value, onChange, onMount, options }: any) => {
    if (!mocks.editor) {
      mocks.editor = { onChange, options };
      queueMicrotask(() =>
        onMount?.({
          getValue: () => value,
          getModel: () => ({ getValueInRange: () => "selected code" }),
          getSelection: () => ({
            isEmpty: () => false,
            startLineNumber: 2,
            endLineNumber: 3,
          }),
          addCommand: () => {},
          onDidChangeCursorSelection: () => ({ dispose: () => {} }),
          focus: () => {},
        }),
      );
    }
    return (
      <textarea
        aria-label="Code"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  },
}));

const conversation: any = {
  id: "conversation-1",
  conversation_url: "http://localhost:8000/api/conversations/conversation-1",
  session_api_key: "session-key",
  workspace: { working_dir: "/workspace/project" },
};
const props = () => ({
  path: "src/app.ts",
  initialText: "original",
  remoteText: "original",
  conversation,
});

describe("WorkspaceCodeEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editor = null;
    useCodeEditorStore.setState({ drafts: {} });
    localStorage.clear();
    mocks.save.mockResolvedValue(undefined);
  });

  // @spec EDITOR-DRAFT-1 — edits are explicit-save and survive closing/reopening a file
  it("keeps an unsaved draft and does not silently upload changes", async () => {
    const user = userEvent.setup();
    const view = render(<WorkspaceCodeEditor {...props()} />);
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "my draft");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByTestId("code-editor-dirty")).toBeInTheDocument();
    view.unmount();
    render(<WorkspaceCodeEditor {...props()} />);
    expect(screen.getByLabelText("Code")).toHaveValue("my draft");
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$SAVE_LABEL }),
    );
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        conversation,
        "src/app.ts",
        "original",
        "my draft",
      ),
    );
    expect(mocks.invalidate).toHaveBeenCalledWith(
      "conversation-1",
      "/workspace/project",
    );
    expect(screen.queryByTestId("code-editor-dirty")).not.toBeInTheDocument();
  });

  // @spec EDITOR-CONFLICT-1 — concurrent agent edits never silently replace a user's draft
  it("shows a conflict, keeps the draft, and requires reviewed overwrite", async () => {
    mocks.save.mockRejectedValueOnce(
      new WorkspaceFileConflictError("agent version"),
    );
    const user = userEvent.setup();
    render(<WorkspaceCodeEditor {...props()} />);
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "my draft");
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$SAVE_LABEL }),
    );
    expect(await screen.findByTestId("code-editor-conflict")).toHaveTextContent(
      "agent version",
    );
    expect(screen.getByLabelText("Code")).toHaveValue("my draft");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$REVIEW }),
    );
    expect(screen.getByTestId("code-editor-conflict-diff")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$KEEP_MINE }),
    );
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$SAVE_LABEL }),
    );
    await waitFor(() =>
      expect(mocks.save).toHaveBeenLastCalledWith(
        conversation,
        "src/app.ts",
        "agent version",
        "my draft",
      ),
    );
  });

  it("offers discard and preserves the original after confirmation", async () => {
    const user = userEvent.setup();
    render(<WorkspaceCodeEditor {...props()} />);
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "draft");
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$DISCARD }),
    );
    await user.click(screen.getByTestId("confirm-button"));
    expect(screen.getByLabelText("Code")).toHaveValue("original");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  // @spec EDITOR-AGENT-1 — send selected code with path/lines to the conversation draft, not an unrelated chat
  it("adds selected code to the conversation draft without sending it automatically", async () => {
    const user = userEvent.setup();
    render(<WorkspaceCodeEditor {...props()} />);
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "unsaved draft");
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$ASK_SELECTION }),
    );
    const draft = localStorage.getItem("conversation-state-conversation-1");
    expect(draft).toContain("src/app.ts:2-3");
    expect(draft).toContain("selected code");
    expect(draft).toContain("unsaved");
  });

  it("retains the draft and exposes retry when the save request fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Connection lost"));
    const user = userEvent.setup();
    render(<WorkspaceCodeEditor {...props()} />);
    await user.clear(screen.getByLabelText("Code"));
    await user.type(screen.getByLabelText("Code"), "draft");
    await user.click(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$SAVE_LABEL }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection lost",
    );
    expect(screen.getByLabelText("Code")).toHaveValue("draft");
    expect(
      screen.getByRole("button", { name: I18nKey.CODE_EDITOR$SAVE_LABEL }),
    ).toBeEnabled();
  });

  it("restores a draft when switching between conversations with the same path", () => {
    appendConversationCodeContext("other", "do not mix conversations");
    const state = useCodeEditorStore.getState();
    state.setDraft("conversation-1", "src/app.ts", "original", "mine");
    render(
      <WorkspaceCodeEditor
        {...props()}
        conversation={{ ...conversation, id: "other" }}
      />,
    );
    expect(screen.getByLabelText("Code")).toHaveValue("original");
  });
});
