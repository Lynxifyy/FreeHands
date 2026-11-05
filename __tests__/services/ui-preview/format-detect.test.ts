import { describe, expect, it } from "vitest";

import {
  detectUiPreviewFormat,
  isUiPreviewFormat,
  UI_PREVIEW_FORMATS,
} from "#/services/ui-preview/format-detect";

describe("detectUiPreviewFormat", () => {
  it("detects HTML by extension, ignoring the body", () => {
    expect(detectUiPreviewFormat("index.html")).toBe("html");
    expect(detectUiPreviewFormat("pages/about.HTM")).toBe("html");
  });

  it("detects SVG by extension", () => {
    expect(detectUiPreviewFormat("icons/logo.svg")).toBe("svg");
  });

  it("detects an Android XML layout from its android namespace", () => {
    const layout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:orientation="vertical" />`;
    expect(
      detectUiPreviewFormat("app/src/main/res/layout/main.xml", layout),
    ).toBe("xml");
  });

  it("detects a generic well-formed XML document", () => {
    expect(detectUiPreviewFormat("config/values.xml", "<resources />")).toBe(
      "xml",
    );
  });

  it("treats an .xml file with no content as XML", () => {
    expect(detectUiPreviewFormat("res/layout/main.xml")).toBe("xml");
  });

  it("detects Jetpack Compose from a @Composable annotation", () => {
    const compose = `
@Composable
fun Greeting(name: String) {
  Text("Hello, $name!")
}`;
    expect(detectUiPreviewFormat("app/MainActivity.kt", compose)).toBe(
      "compose",
    );
  });

  it("detects Compose from a setContent call without an annotation", () => {
    expect(
      detectUiPreviewFormat("app/MainActivity.kt", 'setContent { Text("hi") }'),
    ).toBe("compose");
  });

  it("does not treat a plain Kotlin file as Compose", () => {
    expect(
      detectUiPreviewFormat("app/Util.kt", "fun add(a: Int, b: Int) = a + b"),
    ).toBe("unknown");
  });

  it("detects markdown by extension", () => {
    expect(detectUiPreviewFormat("README.md")).toBe("markdown");
  });

  it("returns unknown for source files with no UI preview", () => {
    expect(detectUiPreviewFormat("src/index.ts")).toBe("unknown");
    expect(detectUiPreviewFormat("Makefile")).toBe("unknown");
  });
});

describe("isUiPreviewFormat", () => {
  it("narrows the known preview formats", () => {
    expect(isUiPreviewFormat("html")).toBe(true);
    expect(isUiPreviewFormat("compose")).toBe(true);
    expect(isUiPreviewFormat("unknown")).toBe(false);
    expect(isUiPreviewFormat("python")).toBe(false);
  });

  it("agrees with the UI_PREVIEW_FORMATS list", () => {
    expect([...UI_PREVIEW_FORMATS]).toEqual([
      "html",
      "svg",
      "xml",
      "compose",
      "markdown",
    ]);
  });
});
