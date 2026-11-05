import { describe, expect, it } from "vitest";

import { transformComposeToHtml } from "#/services/ui-preview/compose-transform";

const ACTIVITY = `package com.example.app

import androidx.compose.runtime.Composable
import androidx.compose.material3.Text

@Composable
fun Greeting() {
  Column {
    Text("Hello")
  }
}
`;

describe("transformComposeToHtml", () => {
  it("renders a Column as a vertical container", () => {
    const { html, warnings } = transformComposeToHtml(ACTIVITY);

    expect(html).toContain("flex-direction:column");
    expect(html).toContain("Hello");
    expect(warnings).toEqual([]);
  });

  it("renders a Row as a horizontal container with spacing", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun Row() { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Text("A"); Text("B") } }`,
    );

    expect(html).toContain("flex-direction:row");
    expect(html).toContain("gap:8px");
  });

  it("applies a padding modifier", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun Pad() { Text("hi", modifier = Modifier.padding(16.dp)) }`,
    );

    expect(html).toContain("padding:16px");
  });

  it("renders a Button label as a disabled button", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun Btn() { Button(onClick = {}) { Text("Save") } }`,
    );

    expect(html).toContain("<button");
    expect(html).toContain("disabled");
    expect(html).toContain("Save");
  });

  it("renders a TextField as a disabled input carrying its label", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun F() { OutlinedTextField(value = "", onValueChange = {}, label = { Text("Email") }) }`,
    );

    expect(html).toContain("<input");
    expect(html).toContain('placeholder="Email"');
  });

  it("renders a LazyColumn with a runtime-items placeholder", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun L() { LazyColumn { item { Text("row") } } }`,
    );

    expect(html.toLowerCase()).toContain("lazycolumn");
    expect(html).toContain("row");
  });

  it("keeps string literals containing parentheses intact", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun S() { Text("Balance: (USD)") }`,
    );

    expect(html).toContain("Balance: (USD)");
  });

  it("escapes markup so a string literal cannot inject HTML", () => {
    const { html } = transformComposeToHtml(
      `@Composable fun X() { Text("<script>alert(1)</script>") }`,
    );

    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("reports an unknown composable as a labelled placeholder", () => {
    const { html, warnings } = transformComposeToHtml(
      `@Composable fun U() { FancyWidget(modifier = Modifier) }`,
    );

    expect(html).toContain("FancyWidget");
    expect(warnings.some((w) => w.includes("FancyWidget"))).toBe(true);
  });

  it("stops at the preview depth limit instead of recursing forever", () => {
    const deep =
      "@Composable fun D() { " + "Column { ".repeat(40) + "}".repeat(40) + " }";
    const { html, warnings } = transformComposeToHtml(deep);

    expect(html).toContain("flex-direction:column");
    expect(warnings.some((w) => /depth/i.test(w))).toBe(true);
  });
});
