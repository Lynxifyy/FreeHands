import React from "react";
import { useTranslation } from "react-i18next";
import ArrowDown from "#/icons/angle-down-solid.svg?react";
import ArrowUp from "#/icons/angle-up-solid.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { MarkdownRenderer } from "../../../features/markdown/markdown-renderer";
import { ThinkingOrb } from "../../../features/chat/thinking-orb";

interface CollapsibleThinkingProps {
  /** The thinking / reasoning content to display when expanded. */
  content: string;
}

/** First non-empty line, trimmed for the collapsed preview. */
function firstLine(content: string): string {
  const line = content
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (!line) return "";
  const stripped = line.replace(/^[#>*\-\s]+/, "");
  return stripped.length > 140 ? `${stripped.slice(0, 139)}…` : stripped;
}

/**
 * Renders agent thinking or extended reasoning content inside a collapsible
 * section.  Collapsed by default so the chat stays compact — especially
 * useful when the thinking language differs from the conversation language.
 *
 * Collapsed, it shows the FreeHands thinking orb, the label, and a one-line
 * preview of the reasoning so the user can follow the agent's direction
 * without expanding it.
 */
export function CollapsibleThinking({ content }: CollapsibleThinkingProps) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = React.useState(false);

  if (!content.trim()) {
    return null;
  }

  const Chevron = expanded ? ArrowUp : ArrowDown;
  const preview = firstLine(content);

  return (
    <div
      className="my-1 w-full py-1 text-sm"
      data-testid="collapsible-thinking"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={
          expanded ? t(I18nKey.THINKING$COLLAPSE) : t(I18nKey.THINKING$EXPAND)
        }
        data-testid="collapsible-thinking-toggle"
        className="w-full flex items-center gap-2 text-left cursor-pointer"
      >
        <Chevron className="h-4 w-4 fill-muted flex-shrink-0" />
        <ThinkingOrb size={16} className="flex-shrink-0" />
        <span className="font-normal text-muted">
          {t(I18nKey.THINKING$TITLE)}
        </span>
        {!expanded && preview ? (
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted/80"
            data-testid="collapsible-thinking-preview"
          >
            {preview}
          </span>
        ) : null}
      </button>

      {expanded && (
        <div className="mt-1.5 pl-6" data-testid="collapsible-thinking-content">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>
      )}
    </div>
  );
}
