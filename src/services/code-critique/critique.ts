import type { CritiqueStrictness } from "#/stores/code-tools-settings-store";
import { analyzeCode } from "./analyzers";
import { detectLanguage } from "./detect-language";
import { verdictFor, type CritiqueIssue, type CritiqueResult } from "./types";

export interface CritiqueInput {
  path: string;
  content: string;
  /** Overrides detection when the caller already knows the language. */
  language?: string;
  /**
   * How much to report. Defaults to `normal` (warnings and errors). `relaxed`
   * keeps only errors; `strict` also surfaces informational notes.
   */
  strictness?: CritiqueStrictness;
}

/**
 * Drops findings below the configured floor. Errors always survive, so a
 * `relaxed` run still answers "that won't work".
 */
function applyStrictness(
  issues: CritiqueIssue[],
  strictness: CritiqueStrictness,
): CritiqueIssue[] {
  if (strictness === "strict") return issues;
  if (strictness === "relaxed") {
    return issues.filter((issue) => issue.severity === "error");
  }
  return issues.filter((issue) => issue.severity !== "info");
}

function summarize(verdict: CritiqueResult["verdict"], count: number): string {
  if (verdict === "pass") return "No problems found.";
  const noun = count === 1 ? "issue" : "issues";
  if (verdict === "fail") {
    return `Found ${count} ${noun}, including at least one error that will not work.`;
  }
  return `Found ${count} ${noun} worth fixing.`;
}

/**
 * Runs every applicable analyzer over a file or snippet and folds the findings
 * into one verdict. Pure and synchronous: the tool must answer immediately,
 * before the agent's next turn.
 */
export function critiqueCode(input: CritiqueInput): CritiqueResult {
  const language = input.language ?? detectLanguage(input.path, input.content);
  const allIssues: CritiqueIssue[] = analyzeCode({
    path: input.path,
    content: input.content,
    language,
  });
  const issues = applyStrictness(allIssues, input.strictness ?? "normal");
  const verdict = verdictFor(issues);
  return {
    verdict,
    summary: summarize(verdict, issues.length),
    language,
    issues,
  };
}
