import { describe, expect, it } from "vitest";

import { analyzeCode } from "#/services/code-critique/analyzers";
import { critiqueCode } from "#/services/code-critique/critique";
import { detectLanguage } from "#/services/code-critique/detect-language";

function rules(issues: { rule: string }[]): string[] {
  return issues.map((issue) => issue.rule);
}

describe("detectLanguage", () => {
  it("maps extensions to language ids", () => {
    expect(detectLanguage("index.html")).toBe("html");
    expect(detectLanguage("res/layout/main.xml")).toBe("xml");
    expect(detectLanguage("app/MainActivity.kt")).toBe("kotlin");
    expect(detectLanguage("src/app.tsx")).toBe("typescript");
    expect(detectLanguage("main.py")).toBe("python");
    expect(detectLanguage("styles.css")).toBe("css");
  });

  it("falls back to content sniffing when the extension is unknown", () => {
    expect(detectLanguage("", '<LinearLayout xmlns:android="x" />')).toBe(
      "xml",
    );
    expect(detectLanguage("", "@Composable fun X() {}")).toBe("kotlin");
  });

  it("returns text for something it cannot place", () => {
    expect(detectLanguage("notes.txt", "just words")).toBe("text");
  });
});

describe("analyzeCode — HTML", () => {
  it("flags an unclosed element as an error", () => {
    const issues = analyzeCode({
      path: "index.html",
      content: "<div><p>hi</div>",
      language: "html",
    });

    expect(rules(issues)).toContain("html/unclosed-tag");
    expect(issues.find((i) => i.rule === "html/unclosed-tag")?.severity).toBe(
      "error",
    );
  });

  it("flags an image without alt text as an accessibility warning", () => {
    const issues = analyzeCode({
      path: "index.html",
      content: '<img src="a.png">',
      language: "html",
    });

    const issue = issues.find((i) => i.rule === "html/img-alt");
    expect(issue?.severity).toBe("warning");
    expect(issue?.category).toBe("accessibility");
  });

  it("flags a button with no accessible name", () => {
    const issues = analyzeCode({
      path: "index.html",
      content: "<button></button>",
      language: "html",
    });

    expect(rules(issues)).toContain("html/empty-button");
  });

  it("reports an inline TODO as incomplete", () => {
    const issues = analyzeCode({
      path: "index.html",
      content: "<div><!-- TODO: finish this --></div>",
      language: "html",
    });

    const issue = issues.find((i) => i.rule === "generic/todo");
    expect(issue?.category).toBe("completeness");
  });

  it("does not flag well-formed, accessible markup", () => {
    const issues = analyzeCode({
      path: "index.html",
      content:
        '<!doctype html><html lang="en"><body><img src="a.png" alt="A"><button type="button">Go</button></body></html>',
      language: "html",
    });

    expect(issues).toEqual([]);
  });
});

describe("analyzeCode — XML layout", () => {
  it("flags malformed XML as an error", () => {
    const issues = analyzeCode({
      path: "res/layout/main.xml",
      content: "<LinearLayout><oops>",
      language: "xml",
    });

    expect(rules(issues)).toContain("xml/not-well-formed");
  });

  it("flags a view that is missing layout_width", () => {
    const issues = analyzeCode({
      path: "res/layout/main.xml",
      content: `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <TextView android:layout_height="wrap_content" />
</LinearLayout>`,
      language: "xml",
    });

    const missingWidth = issues.filter(
      (issue) => issue.rule === "xml/missing-layout-width",
    );
    expect(missingWidth.length).toBeGreaterThan(0);
    expect(missingWidth[0].severity).toBe("warning");
    // The TextView on line 2 is the offending element.
    expect(missingWidth.some((issue) => issue.line === 2)).toBe(true);
  });

  it("accepts a complete layout", () => {
    const issues = analyzeCode({
      path: "res/layout/main.xml",
      content: `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent" android:layout_height="match_parent">
  <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" />
</LinearLayout>`,
      language: "xml",
    });

    expect(issues).toEqual([]);
  });
});

describe("analyzeCode — Kotlin / Compose", () => {
  it("flags unbalanced braces as an error", () => {
    const issues = analyzeCode({
      path: "app/MainActivity.kt",
      content: '@Composable fun X() { Column { Text("hi") }',
      language: "kotlin",
    });

    expect(rules(issues)).toContain("kotlin/unbalanced-delimiters");
  });

  it("flags a Compose call inside a function that is not @Composable", () => {
    const issues = analyzeCode({
      path: "app/MainActivity.kt",
      content: `fun buildUi() {
  Column { Text("hi") }
}`,
      language: "kotlin",
    });

    expect(rules(issues)).toContain("kotlin/composable-without-annotation");
  });

  it("flags Compose usage with no Compose import", () => {
    const issues = analyzeCode({
      path: "app/MainActivity.kt",
      content: `@Composable
fun X() {
  Text("hi")
}`,
      language: "kotlin",
    });

    expect(rules(issues)).toContain("kotlin/missing-compose-import");
  });

  it("does not flag a complete, imported Compose file", () => {
    const issues = analyzeCode({
      path: "app/MainActivity.kt",
      content: `package com.example

import androidx.compose.runtime.Composable
import androidx.compose.material3.Text

@Composable
fun X() {
  Text("hi")
}`,
      language: "kotlin",
    });

    expect(issues).toEqual([]);
  });

  it("flags TODO() as incomplete", () => {
    const issues = analyzeCode({
      path: "app/MainActivity.kt",
      content: "fun x() { TODO() }",
      language: "kotlin",
    });

    expect(rules(issues)).toContain("kotlin/todo-call");
  });
});

describe("analyzeCode — generic completeness", () => {
  it("flags a Python pass-only function body", () => {
    const issues = analyzeCode({
      path: "app/main.py",
      content: "def build():\n    pass\n",
      language: "python",
    });

    expect(rules(issues)).toContain("generic/empty-body");
  });

  it("flags a not-implemented throw", () => {
    const issues = analyzeCode({
      path: "src/x.ts",
      content: "export function go() { throw new Error('Not implemented'); }",
      language: "typescript",
    });

    expect(rules(issues)).toContain("generic/not-implemented");
  });

  it("does not flag ordinary code", () => {
    const issues = analyzeCode({
      path: "src/x.ts",
      content: "export function add(a: number, b: number) { return a + b; }",
      language: "typescript",
    });

    expect(issues).toEqual([]);
  });
});

describe("critiqueCode", () => {
  it("fails with a summary when there is an error", () => {
    const result = critiqueCode({
      path: "index.html",
      content: "<div><p>hi</div>",
    });

    expect(result.verdict).toBe("fail");
    expect(result.language).toBe("html");
    expect(result.summary).toMatch(/error/i);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("warns when there is only a warning", () => {
    const result = critiqueCode({
      path: "index.html",
      content: '<img src="a.png">',
    });

    expect(result.verdict).toBe("warn");
  });

  it("passes clean code with an empty issue list", () => {
    const result = critiqueCode({
      path: "src/x.ts",
      content: "export const answer = 42;",
    });

    expect(result.verdict).toBe("pass");
    expect(result.issues).toEqual([]);
    expect(result.summary).toMatch(/no problems/i);
  });

  it("detects the language from the path when not supplied", () => {
    const result = critiqueCode({
      path: "app/MainActivity.kt",
      content: "fun x() { TODO() }",
    });

    expect(result.language).toBe("kotlin");
  });
});

describe("critiqueCode strictness", () => {
  const warnOnly = { path: "index.html", content: '<img src="a.png">' };

  it("defaults to normal: keeps warnings and errors", () => {
    const result = critiqueCode(warnOnly);
    expect(result.verdict).toBe("warn");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("relaxed keeps only errors", () => {
    const result = critiqueCode({ ...warnOnly, strictness: "relaxed" });
    expect(result.verdict).toBe("pass");
    expect(result.issues).toEqual([]);
  });

  it("relaxed still reports an error", () => {
    const result = critiqueCode({
      path: "index.html",
      content: "<div><p>hi</div>",
      strictness: "relaxed",
    });
    expect(result.verdict).toBe("fail");
  });

  it("strict keeps informational notes too", () => {
    const result = critiqueCode({
      path: "index.html",
      content: '<!-- TODO: x --><img src="a.png" alt="a">',
      strictness: "strict",
    });
    expect(result.issues.some((i) => i.category === "completeness")).toBe(true);
  });

  it("normal drops informational notes", () => {
    const result = critiqueCode({
      path: "index.html",
      content: '<!-- TODO: x --><img src="a.png" alt="a">',
      strictness: "normal",
    });
    expect(result.issues.some((i) => i.category === "completeness")).toBe(
      false,
    );
  });
});
