import type { UiPreviewFormat } from "./format-detect";
import { PREVIEW_STYLESHEET } from "./preview-styles";
import { transformComposeToHtml } from "./compose-transform";
import { transformXmlLayoutToHtml } from "./xml-layout-transform";

export interface PreviewSrcDocInput {
  format: UiPreviewFormat;
  content: string;
  /**
   * Absolute URL of the previewed file (or its directory). When set, the
   * generated document gets a `<base href>` so relative assets — CSS, JS,
   * images — resolve instead of 404ing against `about:srcdoc`.
   */
  baseHref?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function warningsBlock(warnings: string[]): string {
  if (warnings.length === 0) return "";
  const items = warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  return `<div class="oh-preview-warnings" role="note">${items
    .replace(/^/, "<ul>")
    .replace(/$/, "</ul>")}</div>`;
}

function baseTag(baseHref: string | null | undefined): string {
  return baseHref ? `<base href="${escapeHtml(baseHref)}" />` : "";
}

function documentShell(body: string, baseHref?: string | null): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    baseTag(baseHref),
    `<style>${PREVIEW_STYLESHEET}</style>`,
    `</head><body>${body}</body></html>`,
  ].join("");
}

function isFullHtmlDocument(content: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(content);
}

/**
 * Insert a `<base>` into an authored HTML document. A full document keeps its
 * own markup; we only add the tag so relative assets resolve in the sandbox.
 * Falls back to prepending when the document has no `<head>`.
 */
function injectBaseHref(html: string, baseHref?: string | null): string {
  if (!baseHref) return html;
  if (/<base[\s>]/i.test(html)) return html;
  const tag = baseTag(baseHref);
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${tag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html[^>]*>/i,
      (htmlTag) => `${htmlTag}<head>${tag}</head>`,
    );
  }
  return `${tag}${html}`;
}

/**
 * Builds the `srcdoc` for the UI Preview iframe.
 *
 * A complete HTML document is passed through untouched so the preview is
 * faithful (the iframe is sandboxed, so authored script cannot reach Canvas).
 * An HTML fragment is wrapped in a document so it renders, and every other
 * format is transformed to a static, script-free document. Transform warnings
 * are surfaced above the preview so an approximate render is never mistaken
 * for a pixel-accurate one.
 */
export function buildPreviewSrcDoc({
  format,
  content,
  baseHref,
}: PreviewSrcDocInput) {
  switch (format) {
    case "html":
      return isFullHtmlDocument(content)
        ? injectBaseHref(content, baseHref)
        : documentShell(content, baseHref);
    case "svg":
      return documentShell(
        `<div style="display:flex;align-items:center;justify-content:center;min-height:80vh">${content}</div>`,
        baseHref,
      );
    case "xml": {
      const { html, warnings } = transformXmlLayoutToHtml(content);
      return documentShell(warningsBlock(warnings) + html, baseHref);
    }
    case "compose": {
      const { html, warnings } = transformComposeToHtml(content);
      return documentShell(warningsBlock(warnings) + html, baseHref);
    }
    case "markdown":
      return documentShell(
        `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(
          content,
        )}</pre>`,
        baseHref,
      );
    default:
      return documentShell(
        `<div class="oh-preview-warnings">Unsupported preview format</div>`,
        baseHref,
      );
  }
}
