import { analyzeCode } from "./analyzers";
import { detectLanguage } from "./detect-language";
import { verdictFor, type CritiqueIssue, type CritiqueResult } from "./types";

export interface CritiqueInput {
  path: string;
  content: string;
  /** Overrides detection when the caller already knows the language. */
  language?: string;
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
  const issues: CritiqueIssue[] = analyzeCode({
    path: input.path,
    content: input.content,
    language,
  });
  const verdict = verdictFor(issues);
  return {
    verdict,
    summary: summarize(verdict, issues.length),
    language,
    issues,
  };
}
