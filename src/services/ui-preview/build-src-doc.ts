import type { UiPreviewFormat } from "./format-detect";
import { PREVIEW_STYLESHEET } from "./preview-styles";
import { transformComposeToHtml } from "./compose-transform";
import { transformXmlLayoutToHtml } from "./xml-layout-transform";

export interface PreviewSrcDocInput {
  format: UiPreviewFormat;
  content: string;
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

function documentShell(body: string): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<style>${PREVIEW_STYLESHEET}</style>`,
    `</head><body>${body}</body></html>`,
  ].join("");
}

function isFullHtmlDocument(content: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(content);
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
export function buildPreviewSrcDoc({ format, content }: PreviewSrcDocInput) {
  switch (format) {
    case "html":
      return isFullHtmlDocument(content) ? content : documentShell(content);
    case "svg":
      return documentShell(
        `<div style="display:flex;align-items:center;justify-content:center;min-height:80vh">${content}</div>`,
      );
    case "xml": {
      const { html, warnings } = transformXmlLayoutToHtml(content);
      return documentShell(warningsBlock(warnings) + html);
    }
    case "compose": {
      const { html, warnings } = transformComposeToHtml(content);
      return documentShell(warningsBlock(warnings) + html);
    }
    case "markdown":
      return documentShell(
        `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(
          content,
        )}</pre>`,
      );
    default:
      return documentShell(
        `<div class="oh-preview-warnings">Unsupported preview format</div>`,
      );
  }
}
