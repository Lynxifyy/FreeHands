---
name: freehands-coding-tools
description: Use the bundled coding MCP tools for git, tests, lint, builds, dependency and secret audits, code intelligence, HTTP/port probes, and Mobilebox live phones.
---

# FreeHands coding tools

This plugin starts one stdio MCP server with 50 coding tools. Use them instead
of ad-hoc shell pipelines when they fit: the results are structured, bounded,
and safe by default.

## First call

Call `workspace_info`. It reports the directory the tools operate on. If it is
not the repository you are working in, call `workspace_root` with the
conversation's workspace path before using any file or git tool.

## Tool groups

- **Git:** `git_status`, `git_diff`, `git_log`, `git_show`, `git_blame`,
  `git_branches`, `git_stash_list`.
- **Verify:** `list_project_commands`, `run_tests`, `run_lint`,
  `run_typecheck`, `run_build`, `run_format_check`, `run_project_script`.
- **Dependencies:** `dependency_audit`, `outdated_dependencies`, `license_scan`.
- **Code intelligence:** `code_search`, `find_files`, `repo_map`,
  `file_outline`, `read_file_range`, `todo_scan`.
- **Edits:** `write_file` (requires `overwrite=true` for an existing file),
  `apply_patch` (checks first; pass `apply=true` to apply).
- **Quality and security:** `secret_scan` (redacted), `complexity_report`,
  `test_coverage_summary`, `regex_test`, `static_audit` (file, line, why a
  construct is wrong, and the better choice), `symbol_usages`, `bundle_size_report`.
- **Data and network:** `json_validate`, `yaml_validate`, `http_probe`,
  `port_check`.
- **Games:** `game_project_scan` (detects Godot, Unity, Unreal, Minecraft mods,
  Bevy and web engines, and prints their build/run commands).
- **System:** `process_list`, `disk_usage`.
- **Mobilebox:** `mobilebox_create_phone`, `mobilebox_list_phones`,
  `mobilebox_observe`, `mobilebox_act`, `mobilebox_screenshot`,
  `mobilebox_watch`, `mobilebox_start`, `mobilebox_park`, `mobilebox_delete`.

## Mobilebox flow (live screen)

1. Before creating a phone, tell the user what you are about to test.
2. `mobilebox_create_phone` returns a `next` instruction. **Ask the user: "Do
   you want to watch the phone live while I work?"**
3. If they say yes, call `mobilebox_watch` and share the `viewer_url`. If they
   say no, continue without the viewer.
4. Drive with `mobilebox_observe` → `mobilebox_act` (batch actions), and save
   evidence with `mobilebox_screenshot` into the workspace.
5. Verify the result on screen before claiming success. Toasts matter.
6. `mobilebox_delete` when done (or `mobilebox_park` if the user wants to
   resume later).

The tools need `MOBILESANDBOX_API_KEY` in the agent-server environment. If it
is missing, tell the user how to set it and stop; never invent a phone.

## Rules

- Prefer `run_tests`/`run_lint`/`run_build` over guessing the project command.
- Run `static_audit` before claiming a task is complete; fix every finding it
  reports or explain why it is intentional.
- Never report a change as done without running the relevant check.
- `secret_scan` returns redacted matches only; never ask it to print a secret.
- File tools are confined to the workspace root; a path outside it is an error.

## Game and research work

When the task is a game or an unfamiliar engine, ground every API call before
writing it:

1. Run `game_project_scan` first. It names the engine and the build/run
   commands, so the toolchain is proven before any feature work.
2. Read the engine version from the project (`project.godot`, `ProjectSettings/
   ProjectVersion.txt`, `*.uproject`, `package.json`). Match the API to that
   version, not to the newest release.
3. Confirm non-obvious APIs against the engine's official documentation or the
   local engine source. If a symbol cannot be confirmed, say so and use the
   documented alternative instead of inventing one.
4. For mobile targets, install the build with `mobilebox_create_phone` →
   `mobilebox_observe` and verify the first screen before claiming it runs.
5. Run `static_audit` and the engine's build command after the change. A game
   that compiles but crashes on start is not done.
