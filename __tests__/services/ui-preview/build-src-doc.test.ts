import { describe, expect, it } from "vitest";

import {
  buildPreviewSrcDoc,
  type PreviewSrcDocInput,
} from "#/services/ui-preview/build-src-doc";

const base: PreviewSrcDocInput = {
  format: "xml",
  content: "<LinearLayout />",
};

describe("buildPreviewSrcDoc", () => {
  it("passes a full HTML document through untouched", () => {
    const doc = "<!doctype html><html><body><h1>Hi</h1></body></html>";
    const html = buildPreviewSrcDoc({ format: "html", content: doc });

    expect(html).toBe(doc);
  });

  it("wraps a bare HTML fragment in a document", () => {
    const html = buildPreviewSrcDoc({ format: "html", content: "<p>frag</p>" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<p>frag</p>");
  });

  it("renders SVG inside a centering document", () => {
    const html = buildPreviewSrcDoc({
      format: "svg",
      content: '<svg viewBox="0 0 10 10"><circle r="5" /></svg>',
    });

    expect(html).toContain("<circle");
    expect(html).toContain("display:flex");
  });

  it("transforms an XML layout and lists its warnings", () => {
    const html = buildPreviewSrcDoc({
      format: "xml",
      content:
        '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"><MyWidget /></LinearLayout>',
    });

    expect(html).toContain('data-android-type="LinearLayout"');
    expect(html).toContain("MyWidget");
    expect(html).toContain("oh-preview-warnings");
  });

  it("transforms Compose source and lists its warnings", () => {
    const html = buildPreviewSrcDoc({
      format: "compose",
      content: '@Composable fun X() { Column { Text("hi") } }',
    });

    expect(html).toContain("flex-direction:column");
    expect(html).toContain("hi");
  });

  it("escapes warning text so a file name cannot inject markup", () => {
    const html = buildPreviewSrcDoc({
      ...base,
      content: "<LinearLayout><Bad/><script>alert(1)</script></LinearLayout>",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders markdown content as escaped preformatted text", () => {
    const html = buildPreviewSrcDoc({
      format: "markdown",
      content: "# Title\n\n<script>alert(1)</script>",
    });

    expect(html).toContain("# Title");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
