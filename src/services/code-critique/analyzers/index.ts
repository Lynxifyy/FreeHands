/**
 * Static analyzers behind `code_critique`. Each analyzer is pure and returns
 * findings in source order; the tool never executes or fetches anything.
 *
 * Findings are deliberately conservative — a false "won't work" is worse than
 * a missed nit — so each rule only fires on a pattern that is unambiguously
 * broken or unambiguously incomplete.
 */

import type { CritiqueIssue } from "../types";

export interface AnalyzeInput {
  path: string;
  content: string;
  language: string;
}

// Tags that never need a closing tag in HTML.
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

const TODO_PATTERN =
  /\b(TODO|FIXME|XXX)\b(?![A-Za-z])|(?:^|[^\w])(?:not implemented|unimplemented|placeholder)\b/i;

function analyzeCompleteness(input: AnalyzeInput): CritiqueIssue[] {
  const issues: CritiqueIssue[] = [];
  input.content.split("\n").forEach((text, index) => {
    if (TODO_PATTERN.test(text)) {
      issues.push({
        rule: "generic/todo",
        severity: "info",
        category: "completeness",
        message: `Marker left in code: ${text.trim()}`,
        line: index + 1,
        hint: "Implement it or remove the marker before finishing.",
      });
    }
  });

  if (
    /\bthrow\s+new\s+\w*Error\(\s*['"][^'"]*not implemented/i.test(
      input.content,
    )
  ) {
    issues.push({
      rule: "generic/not-implemented",
      severity: "warning",
      category: "completeness",
      message: "Function throws a not-implemented error.",
      hint: "Provide a real implementation before declaring the task done.",
    });
  }

  if (/:\s*\n[ \t]*pass\b/.test(input.content)) {
    issues.push({
      rule: "generic/empty-body",
      severity: "warning",
      category: "completeness",
      message: "Function body is only `pass`.",
      hint: "Implement the body or remove the function.",
    });
  }

  return issues;
}

function analyzeHtml(input: AnalyzeInput): CritiqueIssue[] {
  const issues: CritiqueIssue[] = [];
  const stack: { tag: string; index: number }[] = [];
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(input.content)) !== null) {
    const [raw, tag, selfClosing] = match;
    const name = tag.toLowerCase();
    if (raw.startsWith("</")) {
      const open = stack.pop();
      if (!open) {
        issues.push({
          rule: "html/unexpected-close-tag",
          severity: "error",
          category: "structure",
          message: `Closing </${name}> has no matching opening tag.`,
          line: lineOf(input.content, match.index),
          hint: `Remove the stray </${name}> or add its opening tag.`,
        });
      } else if (open.tag !== name) {
        issues.push({
          rule: "html/mismatched-tag",
          severity: "error",
          category: "structure",
          message: `</${name}> closes <${open.tag}> instead.`,
          line: lineOf(input.content, match.index),
          hint: `Close <${open.tag}> before <${name}>.`,
        });
      }
      continue;
    }

    if (selfClosing || VOID_TAGS.has(name)) continue;
    stack.push({ tag: name, index: match.index });
  }

  for (const open of stack) {
    issues.push({
      rule: "html/unclosed-tag",
      severity: "error",
      category: "structure",
      message: `<${open.tag}> is never closed.`,
      line: lineOf(input.content, open.index),
      hint: `Add the matching </${open.tag}>.`,
    });
  }

  const imgPattern = /<img\b([^>]*)>/gi;
  while ((match = imgPattern.exec(input.content)) !== null) {
    const attributes = match[1];
    if (!/\balt\s*=/.test(attributes)) {
      issues.push({
        rule: "html/img-alt",
        severity: "warning",
        category: "accessibility",
        message: "Image has no alt attribute.",
        line: lineOf(input.content, match.index),
        hint: 'Add alt="…" describing the image, or alt="" if decorative.',
      });
    }
  }

  const buttonPattern = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  while ((match = buttonPattern.exec(input.content)) !== null) {
    const inner = match[1].replace(/<!--[\s\S]*?-->/g, "").trim();
    const hasIconOnlyAria = /\baria-label\s*=\s*["'][^"']+["']/.test(match[0]);
    if (inner.length === 0 && !hasIconOnlyAria) {
      issues.push({
        rule: "html/empty-button",
        severity: "warning",
        category: "accessibility",
        message: "Button has no accessible name.",
        line: lineOf(input.content, match.index),
        hint: "Add visible text or an aria-label.",
      });
    }
  }

  return issues;
}

function analyzeXml(input: AnalyzeInput): CritiqueIssue[] {
  const issues: CritiqueIssue[] = [];

  const parsed = new DOMParser().parseFromString(
    input.content,
    "application/xml",
  );
  if (parsed.querySelector("parsererror")) {
    issues.push({
      rule: "xml/not-well-formed",
      severity: "error",
      category: "syntax",
      message: "XML is not well-formed.",
      hint: "Fix the reported parse error; malformed layouts fail the build.",
    });
    return issues;
  }

  const isAndroidLayout = /xmlns:android=/.test(input.content);
  if (!isAndroidLayout) return issues;

  const all = parsed.getElementsByTagName("*");
  for (let i = 0; i < all.length; i += 1) {
    const element = all[i];
    const tag = element.tagName;
    if (tag === "include" || tag === "merge" || tag === "requestFocus")
      continue;

    const width = element.getAttribute("android:layout_width");
    const height = element.getAttribute("android:layout_height");
    const line = lineOf(input.content, input.content.indexOf(`<${tag}`));
    if (!width) {
      issues.push({
        rule: "xml/missing-layout-width",
        severity: "warning",
        category: "structure",
        message: `<${tag}> is missing android:layout_width.`,
        line,
        hint: 'Add android:layout_width="wrap_content" or "match_parent".',
      });
    }
    if (!height) {
      issues.push({
        rule: "xml/missing-layout-height",
        severity: "warning",
        category: "structure",
        message: `<${tag}> is missing android:layout_height.`,
        line,
        hint: 'Add android:layout_height="wrap_content" or "match_parent".',
      });
    }
  }

  return issues;
}

function stripKotlinStringsAndComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function countChar(text: string, char: string): number {
  let count = 0;
  for (const candidate of text) if (candidate === char) count += 1;
  return count;
}

function analyzeKotlin(input: AnalyzeInput): CritiqueIssue[] {
  const issues: CritiqueIssue[] = [];
  const code = stripKotlinStringsAndComments(input.content);

  for (const [open, close, label] of [
    ["{", "}", "braces"],
    ["(", ")", "parentheses"],
  ] as const) {
    if (countChar(code, open) !== countChar(code, close)) {
      issues.push({
        rule: "kotlin/unbalanced-delimiters",
        severity: "error",
        category: "syntax",
        message: `Unbalanced ${label} in Kotlin source.`,
        hint: `Every '${open}' needs a matching '${close}'.`,
      });
    }
  }

  const usesCompose = /@Composable|setContent\s*\{/.test(input.content);
  const usesComposeImport = /^import\s+androidx\.compose\./m.test(
    input.content,
  );
  if (usesCompose && !usesComposeImport) {
    issues.push({
      rule: "kotlin/missing-compose-import",
      severity: "error",
      category: "syntax",
      message: "Compose UI is used without importing androidx.compose.",
      hint: "Add the androidx.compose imports the file references.",
    });
  }

  // A composable call inside a function with no @Composable annotation and no
  // composable context will not compile.
  const composableCall =
    /\b(Column|Row|Box|Text|Button|LazyColumn|LazyRow|Scaffold|Card|Surface)\s*\(/;
  const functionPattern =
    /\bfun\s+\w+[^({]*\([^)]*\)\s*(?::\s*[\w<>.?]+)?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = functionPattern.exec(input.content)) !== null) {
    const before = input.content.slice(0, match.index);
    const lastAnnotation = before.lastIndexOf("@Composable");
    const hasAnnotation = lastAnnotation !== -1;
    const end = match.index + match[0].length;
    const body = input.content.slice(end, end + 400);
    if (!hasAnnotation && composableCall.test(body)) {
      issues.push({
        rule: "kotlin/composable-without-annotation",
        severity: "error",
        category: "syntax",
        message: "Composable UI is used in a function not marked @Composable.",
        line: lineOf(input.content, match.index),
        hint: "Annotate the function with @Composable.",
      });
    }
  }

  if (/\bTODO\(/.test(input.content)) {
    issues.push({
      rule: "kotlin/todo-call",
      severity: "info",
      category: "completeness",
      message: "Kotlin TODO() call left in source.",
      hint: "Replace TODO() with a real implementation.",
    });
  }

  return issues;
}

export function analyzeCode(input: AnalyzeInput): CritiqueIssue[] {
  const completeness = analyzeCompleteness(input);
  switch (input.language) {
    case "html":
      return [...analyzeHtml(input), ...completeness];
    case "xml":
      return [...analyzeXml(input), ...completeness];
    case "kotlin":
      return [...analyzeKotlin(input), ...completeness];
    default:
      return completeness;
  }
}
