/**
 * Formats the UI Preview sidebar can render, plus the classification that
 * decides which renderer a workspace file gets.
 *
 * Detection is extension-first for formats whose extension is unambiguous
 * (HTML, SVG, markdown), and content-aware for the two that share `.xml` /
 * `.kt`: an Android layout is XML, while a Kotlin file only counts as a
 * Compose preview when it actually declares composable UI.
 */

export const UI_PREVIEW_FORMATS = [
  "html",
  "svg",
  "xml",
  "compose",
  "markdown",
] as const;

export type UiPreviewFormat = (typeof UI_PREVIEW_FORMATS)[number];

/** `unknown` means "this file has no UI preview renderer". */
export type DetectedUiPreviewFormat = UiPreviewFormat | "unknown";

const FORMAT_SET: ReadonlySet<string> = new Set(UI_PREVIEW_FORMATS);

/** Narrows an arbitrary string to a renderable preview format. */
export function isUiPreviewFormat(value: string): value is UiPreviewFormat {
  return FORMAT_SET.has(value);
}

function getExtension(path: string): string {
  const cleaned = path.split(/[?#]/, 1)[0];
  const base = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

// Compose is a Kotlin DSL, so a `.kt` file is only previewable when it uses
// it. `setContent`/`composeView` cover Activity entry points that build UI
// without an explicit annotation on the same line.
const COMPOSE_SIGNALS = [
  "@Composable",
  "setContent",
  "composeView",
  "ComposeView",
];

function looksLikeCompose(content: string): boolean {
  return COMPOSE_SIGNALS.some((signal) => content.includes(signal));
}

/**
 * Classifies a workspace file for the UI Preview tab.
 *
 * @param path workspace-relative path (extension drives the fast path)
 * @param content optional file body; sharpens the `.kt` and `.xml` decisions
 *                and is not required for unambiguous extensions.
 */
export function detectUiPreviewFormat(
  path: string,
  content?: string | null,
): DetectedUiPreviewFormat {
  const ext = getExtension(path);

  if (ext === "html" || ext === "htm") return "html";
  if (ext === "svg") return "svg";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "xml") return "xml";
  if (ext === "kt" || ext === "kts") {
    return content && looksLikeCompose(content) ? "compose" : "unknown";
  }

  return "unknown";
}

/**
 * Path-only resolution for callers that must decide *where* to route a file
 * before its body is available (the `canvas_ui_control` dispatcher). Unlike
 * {@link detectUiPreviewFormat}, a `.kt` path is taken as a Compose request
 * because the agent only asks to preview a Kotlin file it knows is UI.
 *
 * Returns `null` when the file has no UI preview and should fall back to the
 * Files tab.
 */
export function previewFormatForPath(path: string): UiPreviewFormat | null {
  const ext = getExtension(path);
  if (ext === "kt" || ext === "kts") return "compose";
  const detected = detectUiPreviewFormat(path);
  return isUiPreviewFormat(detected) ? detected : null;
}
