/**
 * Shared vocabulary for the `code_critique` agent tool.
 *
 * The tool answers three questions a coding agent needs asked out loud:
 * "that won't work" (error), "that's wrong" (warning), and "that's
 * incomplete" (the `completeness` category). Every finding carries a stable
 * `rule` id so the UI can group them and tests can assert on behaviour
 * rather than on message wording.
 */

export type CritiqueSeverity = "error" | "warning" | "info";

export type CritiqueCategory =
  | "syntax"
  | "structure"
  | "accessibility"
  | "completeness"
  | "best-practice";

export interface CritiqueIssue {
  /** Stable machine id, e.g. `html/unclosed-tag`. */
  rule: string;
  severity: CritiqueSeverity;
  category: CritiqueCategory;
  message: string;
  /** 1-based line, when the analyzer can locate the problem. */
  line?: number;
  /** What to do about it, phrased as an instruction to the agent. */
  hint?: string;
}

export interface CritiqueResult {
  /** `fail` on any error, `warn` on any warning, else `pass`. */
  verdict: "pass" | "warn" | "fail";
  /** One-line human summary of the verdict. */
  summary: string;
  /** Detected language id (`html`, `xml`, `kotlin`, `typescript`, …). */
  language: string;
  issues: CritiqueIssue[];
}

const SEVERITY_RANK: Record<CritiqueSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

/** Highest severity present, or `null` for an empty list. */
export function highestSeverity(
  issues: CritiqueIssue[],
): CritiqueSeverity | null {
  let highest: CritiqueSeverity | null = null;
  for (const issue of issues) {
    if (
      highest === null ||
      SEVERITY_RANK[issue.severity] > SEVERITY_RANK[highest]
    ) {
      highest = issue.severity;
    }
  }
  return highest;
}

export function verdictFor(issues: CritiqueIssue[]): CritiqueResult["verdict"] {
  const highest = highestSeverity(issues);
  if (highest === "error") return "fail";
  if (highest === "warning") return "warn";
  return "pass";
}
