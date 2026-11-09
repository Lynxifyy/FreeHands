import type { OHEvent } from "#/stores/use-event-store";
import { detectUiPreviewFormat } from "./format-detect";

// File-editor observation kinds that write to disk (same set the Files tab
// auto-refresh watches).
const FILE_EDIT_OBSERVATION_KINDS: ReadonlySet<string> = new Set([
  "FileEditorObservation",
  "StrReplaceEditorObservation",
  "PlanningFileEditorObservation",
]);

// `view` reads a file without changing it — never a preview trigger.
const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set(["view"]);

interface ObservationShape {
  kind?: string;
  command?: string;
  path?: string | null;
  new_content?: string | null;
}

/**
 * Returns the workspace path a file-editor observation just wrote when that
 * file has a UI Preview renderer, or `null` otherwise.
 *
 * Reuses {@link detectUiPreviewFormat} so the automatic preview agrees with the
 * Preview tab on what counts as UI (HTML, SVG, Android XML layout, Compose
 * Kotlin, markdown) — including the content-aware `.kt` / `.xml` decisions.
 */
export function uiPreviewPathFromEvent(event: OHEvent): string | null {
  const obs = (event as { observation?: ObservationShape }).observation;
  if (!obs || typeof obs.kind !== "string") return null;
  if (!FILE_EDIT_OBSERVATION_KINDS.has(obs.kind)) return null;
  if (obs.command && READ_ONLY_COMMANDS.has(obs.command)) return null;

  const path = typeof obs.path === "string" ? obs.path : null;
  if (!path) return null;

  const detected = detectUiPreviewFormat(path, obs.new_content ?? null);
  return detected === "unknown" ? null : path;
}
