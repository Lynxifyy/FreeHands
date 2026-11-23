---
name: freehands-coding-tools
description: Use the bundled coding MCP tools for git, tests, lint, builds, dependency and secret audits, code intelligence, HTTP/port probes, and Mobilebox live phones.
---

# FreeHands coding tools

This plugin starts one stdio MCP server with 46 coding tools. Use them instead
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
  `test_coverage_summary`, `regex_test`.
- **Data and network:** `json_validate`, `yaml_validate`, `http_probe`,
  `port_check`.
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
- Never report a change as done without running the relevant check.
- `secret_scan` returns redacted matches only; never ask it to print a secret.
- File tools are confined to the workspace root; a path outside it is an error.
