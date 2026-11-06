import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type {
  CritiqueResult,
  CritiqueSeverity,
} from "#/services/code-critique/types";
import { defineVisualizer } from "../define";
import { FilePathChip } from "../primitives/file-path-chip";

/**
 * Normalizes whatever the observation carries into a `CritiqueResult`. The
 * agent-server acknowledges client tools with a generic observation, so the
 * real findings reach the chat through the agent's reply; this reads the
 * structured result when the observation happens to carry it and renders
 * nothing otherwise (the markdown fallback still shows the acknowledgement).
 */
function readCritiqueResult(value: unknown): CritiqueResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CritiqueResult>;
  if (
    candidate.verdict !== "pass" &&
    candidate.verdict !== "warn" &&
    candidate.verdict !== "fail"
  ) {
    return null;
  }
  return {
    verdict: candidate.verdict,
    summary: typeof candidate.summary === "string" ? candidate.summary : "",
    language:
      typeof candidate.language === "string" ? candidate.language : "text",
    issues: Array.isArray(candidate.issues) ? candidate.issues : [],
  };
}

const SEVERITY_CLASSES: Record<CritiqueSeverity, string> = {
  error: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-interactive-active text-muted",
};

const VERDICT_LABEL: Record<CritiqueResult["verdict"], I18nKey> = {
  pass: I18nKey.CODE_CRITIQUE$VERDICT_PASS,
  warn: I18nKey.CODE_CRITIQUE$VERDICT_WARN,
  fail: I18nKey.CODE_CRITIQUE$VERDICT_FAIL,
};

const SEVERITY_LABEL: Record<CritiqueSeverity, I18nKey> = {
  error: I18nKey.CODE_CRITIQUE$SEVERITY_ERROR,
  warning: I18nKey.CODE_CRITIQUE$SEVERITY_WARNING,
  info: I18nKey.CODE_CRITIQUE$SEVERITY_INFO,
};

function IssueRow({
  rule,
  severity,
  message,
  line,
  hint,
}: {
  rule: string;
  severity: CritiqueSeverity;
  message: string;
  line?: number;
  hint?: string;
}) {
  const { t } = useTranslation("openhands");
  return (
    <li className="flex flex-col gap-0.5 rounded border border-surface-raised bg-surface-raised p-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium uppercase",
            SEVERITY_CLASSES[severity],
          )}
        >
          {t(SEVERITY_LABEL[severity])}
        </span>
        {line !== undefined && (
          <span className="font-mono text-xs text-muted">
            {t(I18nKey.CODE_CRITIQUE$LINE, { line })}
          </span>
        )}
        <span className="truncate font-mono text-xs text-muted">{rule}</span>
      </div>
      <span className="text-xs text-foreground">{message}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </li>
  );
}

/**
 * Code-critique visualizer. The action card shows the file or snippet the
 * agent asked to review; the observation card, when it carries a structured
 * result, shows the verdict, summary and the issue list with severities.
 */
export const codeCritiqueVisualizer = defineVisualizer({
  actionKinds: ["ClientAction_code_critique"],
  Body: function CodeCritiqueBody({ action }) {
    const { t } = useTranslation("openhands");
    const act = action?.action;
    const path = act?.path?.trim();
    const code = act?.code?.trim();
    const result = readCritiqueResult(
      (action as { observation?: unknown } | undefined)?.observation,
    );

    return (
      <div className="flex flex-col gap-2">
        {path && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {t(I18nKey.CODE_CRITIQUE$REVIEWING)}
            </span>
            <FilePathChip path={path} />
          </div>
        )}
        {result && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium uppercase",
                  result.verdict === "fail"
                    ? SEVERITY_CLASSES.error
                    : result.verdict === "warn"
                      ? SEVERITY_CLASSES.warning
                      : "bg-success/15 text-success",
                )}
              >
                {t(VERDICT_LABEL[result.verdict])}
              </span>
              <span className="text-xs text-foreground">{result.summary}</span>
            </div>
            {result.issues.length > 0 && (
              <ul className="flex flex-col gap-1">
                {result.issues.map((issue, index) => (
                  <IssueRow key={`${issue.rule}-${index}`} {...issue} />
                ))}
              </ul>
            )}
          </div>
        )}
        {!result && code && (
          <pre className="overflow-auto rounded border border-surface-raised bg-surface-raised p-2 text-xs text-foreground">
            {code}
          </pre>
        )}
      </div>
    );
  },
});
