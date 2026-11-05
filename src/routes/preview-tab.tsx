import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, MonitorSmartphone, RefreshCw } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import {
  useWorkspaceMutationCounter,
  withWorkspaceCacheBuster,
} from "#/stores/use-workspace-mutation-counter";
import { useUiPreviewStore } from "#/stores/ui-preview-store";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";
import { buildPreviewSrcDoc } from "#/services/ui-preview/build-src-doc";
import {
  detectUiPreviewFormat,
  type UiPreviewFormat,
} from "#/services/ui-preview/format-detect";
import { cn } from "#/utils/utils";
import { Typography } from "#/ui/typography";

const FORMAT_LABEL_KEYS: Record<UiPreviewFormat, I18nKey> = {
  html: I18nKey.UI_PREVIEW$FORMAT_HTML,
  svg: I18nKey.UI_PREVIEW$FORMAT_SVG,
  xml: I18nKey.UI_PREVIEW$FORMAT_XML,
  compose: I18nKey.UI_PREVIEW$FORMAT_COMPOSE,
  markdown: I18nKey.UI_PREVIEW$FORMAT_MARKDOWN,
};

/**
 * UI Preview tab: renders the file the agent (via `canvas_ui_control`) or the
 * user selected, using a sandboxed iframe for HTML/SVG and a deterministic
 * structural renderer for Android XML layouts and Jetpack Compose.
 *
 * The iframe is sandboxed without `allow-same-origin`, so previewed markup
 * cannot reach Canvas state, cookies, or the network through the parent.
 */
function UiPreviewPanel() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useOptionalConversationId();
  const target = useUiPreviewStore((state) =>
    conversationId ? state.targets[conversationId] : undefined,
  );
  const bumpRefresh = useUiPreviewStore((state) => state.bumpRefresh);
  const setAutoRefresh = useUiPreviewStore((state) => state.setAutoRefresh);
  const mutationCount = useWorkspaceMutationCounter((state) => state.count);
  const query = useWorkspaceFileContent(target?.path ?? null);

  // Agent file edits bump the shared mutation counter; only follow it when the
  // user left auto-refresh on. A manual refresh always changes the token.
  const effectiveToken =
    target === undefined
      ? 0
      : target.refreshToken + (target.autoRefresh ? mutationCount : 0);

  const detected = useMemo(
    () =>
      target
        ? detectUiPreviewFormat(target.path, query.data?.text ?? null)
        : "unknown",
    [target, query.data?.text],
  );

  if (!target) {
    return (
      <ConversationTabEmptyState
        icon={<MonitorSmartphone className="size-6" />}
      >
        <div className="flex flex-col items-center gap-1 px-6 text-center">
          <Typography.Text className="text-sm text-contrast">
            {t(I18nKey.UI_PREVIEW$EMPTY_TITLE)}
          </Typography.Text>
          <Typography.Text className="text-xs text-muted">
            {t(I18nKey.UI_PREVIEW$EMPTY_BODY)}
          </Typography.Text>
        </div>
      </ConversationTabEmptyState>
    );
  }

  const format = detected === "unknown" ? target.format : detected;

  const staticUrl = query.data?.staticUrl
    ? withWorkspaceCacheBuster(query.data.staticUrl, effectiveToken)
    : null;

  const srcDoc =
    query.data?.kind === "text" && query.data.text !== null
      ? buildPreviewSrcDoc({ format, content: query.data.text })
      : null;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 min-h-9 items-center gap-2 border-b border-border px-2">
        <span
          className={cn(
            "shrink-0 rounded bg-interactive-active px-1.5 py-0.5 text-xs",
            "font-medium uppercase text-contrast",
          )}
        >
          {t(FORMAT_LABEL_KEYS[format])}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-xs text-muted"
          title={target.path}
        >
          {target.path}
        </span>
        <button
          type="button"
          data-testid="ui-preview-auto-refresh"
          aria-pressed={target.autoRefresh}
          aria-label={t(I18nKey.UI_PREVIEW$AUTO_REFRESH)}
          title={t(I18nKey.UI_PREVIEW$AUTO_REFRESH)}
          onClick={() =>
            conversationId &&
            setAutoRefresh(conversationId, !target.autoRefresh)
          }
          className={cn(
            "shrink-0 rounded p-1",
            target.autoRefresh
              ? "text-contrast"
              : "text-muted hover:text-contrast",
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          data-testid="ui-preview-refresh"
          aria-label={t(I18nKey.UI_PREVIEW$REFRESH)}
          title={t(I18nKey.UI_PREVIEW$REFRESH)}
          onClick={() => conversationId && bumpRefresh(conversationId)}
          className="shrink-0 rounded p-1 text-muted hover:text-contrast"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
        {staticUrl && (
          <a
            data-testid="ui-preview-open-new-tab"
            href={staticUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t(I18nKey.UI_PREVIEW$OPEN_NEW_TAB)}
            title={t(I18nKey.UI_PREVIEW$OPEN_NEW_TAB)}
            className="shrink-0 rounded p-1 text-muted hover:text-contrast"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-surface">
        {query.isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {t(I18nKey.UI_PREVIEW$LOADING)}
          </div>
        )}
        {!query.isLoading && (query.isError || !query.data) && (
          <div
            data-testid="ui-preview-error"
            className="flex h-full items-center justify-center px-6 text-center text-sm text-muted"
          >
            {(query.error as Error | undefined)?.message ??
              t(I18nKey.UI_PREVIEW$LOAD_ERROR)}
          </div>
        )}
        {!query.isLoading && query.data && (
          <>
            {srcDoc !== null ? (
              <iframe
                data-testid="ui-preview-frame"
                title={target.path}
                sandbox=""
                srcDoc={srcDoc}
                className="h-full w-full border-0 bg-white"
              />
            ) : staticUrl ? (
              <iframe
                data-testid="ui-preview-frame"
                title={target.path}
                sandbox=""
                src={staticUrl}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <div
                data-testid="ui-preview-unsupported"
                className="flex h-full items-center justify-center px-6 text-center text-sm text-muted"
              >
                {t(I18nKey.UI_PREVIEW$UNSUPPORTED_FORMAT)}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default UiPreviewPanel;
