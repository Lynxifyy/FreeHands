# UI Preview and code critique

**Spec ID:** UIP-001
**Status:** Implemented

## UIP-001 — UI Preview tab renders agent-authored UI formats

- [x] The conversation drawer exposes a `preview` tab (`COMMON$PREVIEW`) alongside the existing tabs, persisted and sanitized like every other tab.
- [x] The tab renders a per-conversation target owned by `useUiPreviewStore`: a workspace-relative path, a detected format, a refresh token, and an auto-refresh flag.
- [x] Format detection is extension-first for HTML, SVG, markdown and XML, and content-aware for `.kt` (Compose only when composable UI is declared).
- [x] HTML and SVG render in a sandboxed iframe; a full HTML document passes through untouched, a fragment is wrapped.
- [x] Android XML layouts and Jetpack Compose render through deterministic, pure transformers (`xml-layout-transform`, `compose-transform`) that map common containers and widgets onto flexbox and surface anything they cannot model as a labelled placeholder plus a warning. Both are explicitly approximate.
- [x] Every transformed document is script-free unless the Code tools setting allows scripts; the iframe is sandboxed without `allow-same-origin` in all cases.
- [x] `canvas_ui_control` `show_preview` on a UI-format file opens the Preview tab and sets the target; `navigate_to_file` and non-UI files keep the Files tab behaviour.

## UIP-002 — code_critique answers "won't work / wrong / incomplete"

- [x] `code_critique` is a client-defined tool registered in the agent-server start-conversation request alongside `canvas_ui_control`, `launch_child_conversation`, and `request_secret`.
- [x] It accepts a workspace-relative `path` (read via the runtime file client) or inline `code`, plus an optional `language` override.
- [x] Analyzers are pure and static: HTML structure and accessibility, Android XML well-formedness and layout attributes, Kotlin/Compose delimiter balance, Compose usage outside `@Composable`, missing Compose imports, and generic incompleteness markers.
- [x] The result is `{ verdict, summary, language, issues[] }`, where each issue carries a stable rule id, severity, category, optional line and hint. The verdict is `fail` on any error, `warn` on any warning, else `pass`.
- [x] Findings are posted back with a `[code-critique]` prefix, which the chat hides; a visualizer renders the verdict and issue list when the observation carries a structured result.
- [x] A replayed tool call is claimed once, so a socket reconnect does not re-analyse or re-post.

## UIP-003 — Code tools settings

- [x] `/settings/code-tools` owns the critique strictness (relaxed / normal / strict) and the UI Preview options (auto-refresh on agent edit, allow scripts).
- [x] The settings persist locally and are read by `code_critique` and the Preview tab respectively.
- [x] `strict` surfaces informational notes, `normal` keeps warnings and errors, `relaxed` keeps only errors; the verdict always reflects the filtered set.

## UIP-004 — Task list progress

- [x] `useTaskList` also returns progress counts, the done percent, and the current task id.
- [x] The Task List tab shows a labelled progress bar and count, calls out the in-progress task, and folds completed tasks into a collapsible section.
