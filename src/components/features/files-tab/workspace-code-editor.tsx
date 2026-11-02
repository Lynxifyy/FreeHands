import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useTranslation } from "react-i18next";
import { Save, Undo2, MessageSquareCode } from "lucide-react";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import {
  saveWorkspaceFile,
  WorkspaceFileConflictError,
} from "#/api/workspace-file-service";
import { useInvalidateWorkspaceFiles } from "#/hooks/use-invalidate-workspace-files";
import {
  useCodeEditorStore,
  getCodeEditorDraftKey,
} from "#/stores/code-editor-store";
import { useColorTheme } from "#/hooks/use-color-theme";
import { COLOR_THEMES } from "#/themes/color-themes";
import { getLanguageFromPath } from "#/utils/get-language-from-path";
import { appendConversationCodeContext } from "#/utils/conversation-local-storage";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { useMonaco } from "#/utils/monaco-loader";

interface Props {
  path: string;
  initialText: string;
  remoteText: string;
  conversation: AppConversation;
}

interface Selection {
  text: string;
  start: number;
  end: number;
}

export function WorkspaceCodeEditor({
  path,
  initialText,
  remoteText,
  conversation,
}: Props) {
  const { t } = useTranslation("openhands");
  const { monaco, error: editorLoadError } = useMonaco();
  const key = getCodeEditorDraftKey(conversation.id, path);
  const draft = useCodeEditorStore((state) => state.drafts[key]);
  const setDraft = useCodeEditorStore((state) => state.setDraft);
  const clearDraft = useCodeEditorStore((state) => state.clearDraft);
  const invalidate = useInvalidateWorkspaceFiles();
  const theme = useColorTheme();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const baseText = draft?.baseText ?? initialText;
  const text = draft?.text ?? initialText;
  const dirty = text !== baseText;
  const latestRemote = savedText ?? remoteText;

  useEffect(() => {
    if (savedText !== null && remoteText === savedText) setSavedText(null);
  }, [remoteText, savedText]);

  // @spec EDITOR-DRAFT-1 — explicit save with recoverable, conversation-scoped drafts
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (dirty && latestRemote !== baseText) setConflict(latestRemote);
  }, [dirty, latestRemote, baseText]);

  const save = useCallback(async () => {
    if (savingRef.current || !dirty) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveWorkspaceFile(conversation, path, baseText, text);
      clearDraft(conversation.id, path);
      setSavedText(text);
      setConflict(null);
      setReviewing(false);
      invalidate(
        conversation.id,
        conversation.workspace?.working_dir ?? undefined,
      );
      displaySuccessToast(t(I18nKey.CODE_EDITOR$FILE_SAVED_SUCCESSFULLY));
    } catch (cause) {
      if (cause instanceof WorkspaceFileConflictError)
        setConflict(cause.remoteText);
      else setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [dirty, conversation, path, baseText, text, clearDraft, invalidate, t]);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const readSelection = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    const range = editor.getSelection();
    const model = editor.getModel();
    if (!range || !model || range.isEmpty()) {
      setSelection(null);
      return;
    }
    setSelection({
      text: model.getValueInRange(range),
      start: range.startLineNumber,
      end: range.endLineNumber,
    });
  };
  const askAgent = () => {
    if (!selection) return;
    // @spec EDITOR-AGENT-1 — attach file/line context to the existing chat draft without auto-sending
    appendConversationCodeContext(
      conversation.id,
      `Please help with ${path}:${selection.start}-${selection.end}.\n` +
        `This selection comes from my ${dirty ? "unsaved editor draft" : "workspace file"}:\n` +
        `\`\`\`${getLanguageFromPath(path)}\n${selection.text}\n\`\`\``,
    );
    displaySuccessToast(t(I18nKey.CODE_EDITOR$CONTEXT_ADDED));
  };
  const options: MonacoEditor.IEditorOptions = {
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineNumbers: "on",
    wordWrap: "on",
    readOnly: saving,
    renderValidationDecorations: "on",
    fixedOverflowWidgets: true,
    padding: { top: 12 },
    accessibilitySupport: "on",
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-testid="workspace-code-editor"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted"
          title={path}
        >
          {path}
        </span>
        {dirty && (
          <span
            className="text-xs text-warning"
            data-testid="code-editor-dirty"
          >
            {t(I18nKey.CODE_EDITOR$UNSAVED)}
          </span>
        )}
        <BrandButton
          type="button"
          variant="secondary"
          isDisabled={!selection}
          onClick={askAgent}
          testId="code-editor-ask-agent"
        >
          <MessageSquareCode size={14} />
          {t(I18nKey.CODE_EDITOR$ASK_SELECTION)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          isDisabled={!dirty || saving}
          onClick={() => setDiscarding(true)}
        >
          <Undo2 size={14} />
          {t(I18nKey.CODE_EDITOR$DISCARD)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="primary"
          isDisabled={!dirty || saving || conflict !== null}
          onClick={save}
          testId="code-editor-save"
        >
          <Save size={14} />
          {t(
            saving
              ? I18nKey.CODE_EDITOR$SAVING_LABEL
              : I18nKey.CODE_EDITOR$SAVE_LABEL,
          )}
        </BrandButton>
      </div>
      {(error || editorLoadError) && (
        <div
          role="alert"
          className="border-b border-border px-3 py-2 text-sm text-danger"
        >
          {t(I18nKey.CODE_EDITOR$FILE_SAVE_ERROR)} {error || editorLoadError}
        </div>
      )}
      {conflict !== null && (
        <div
          className="shrink-0 border-b border-border bg-surface-raised p-3 text-sm"
          data-testid="code-editor-conflict"
        >
          <p role="alert">{t(I18nKey.CODE_EDITOR$CONFLICT)}</p>
          <pre className="my-2 max-h-28 overflow-auto rounded bg-surface p-2 text-xs">
            {conflict}
          </pre>
          <div className="flex flex-wrap gap-2">
            <BrandButton
              type="button"
              variant="secondary"
              onClick={() => setReviewing(!reviewing)}
            >
              {t(I18nKey.CODE_EDITOR$REVIEW)}
            </BrandButton>
            <BrandButton
              type="button"
              variant="primary"
              onClick={() => {
                setDraft(conversation.id, path, conflict, text);
                setSavedText(conflict);
                setConflict(null);
                setReviewing(false);
              }}
            >
              {t(I18nKey.CODE_EDITOR$KEEP_MINE)}
            </BrandButton>
          </div>
          {reviewing && (
            <div className="mt-2 h-64" data-testid="code-editor-conflict-diff">
              <DiffEditor
                original={conflict}
                modified={text}
                language={getLanguageFromPath(path)}
                theme={
                  COLOR_THEMES[theme].appearance === "light" ? "vs" : "vs-dark"
                }
                options={{
                  ...options,
                  readOnly: true,
                  renderSideBySide: false,
                }}
              />
            </div>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {monaco && (
          <Editor
            path={`${conversation.id}/${path}`}
            language={getLanguageFromPath(path)}
            value={text}
            theme={
              COLOR_THEMES[theme].appearance === "light" ? "vs" : "vs-dark"
            }
            options={options}
            onChange={(value) => {
              if (value !== undefined)
                setDraft(conversation.id, path, baseText, value);
            }}
            onMount={(editor) => {
              editorRef.current = editor;
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                () => {
                  void saveRef.current();
                },
              );
              editor.onDidChangeCursorSelection(() => readSelection(editor));
              readSelection(editor);
            }}
          />
        )}
      </div>
      {discarding && (
        <ConfirmationModal
          text={t(I18nKey.CODE_EDITOR$DISCARD_CONFIRM)}
          confirmText={t(I18nKey.CODE_EDITOR$DISCARD)}
          onCancel={() => setDiscarding(false)}
          onConfirm={() => {
            clearDraft(conversation.id, path);
            setDiscarding(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
