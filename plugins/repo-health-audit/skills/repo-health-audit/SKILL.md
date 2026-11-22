---
name: repo-health-audit
description: Audit a repository end to end — build, tests, lint, TODOs, dependency risk — and produce a prioritised health report.
---

# Repository health audit

Use this skill when the user asks "how healthy is this repo", "what should we fix
next", or wants a pre-release quality check.

## Procedure

1. Identify the stack from the manifests (`package.json`, `pyproject.toml`,
   `go.mod`, `Cargo.toml`, `build.gradle`, `pom.xml`). Record the exact commands
   the project documents; do not invent a different toolchain.
2. Run `scripts/audit.sh` from the repository root. It gathers, without
   modifying anything:
   - the default branch and last 20 commits,
   - uncommitted changes,
   - `TODO`/`FIXME`/`HACK` counts by file,
   - the project's lint, test and build commands (from `package.json` scripts,
     `Makefile` targets or the documented commands),
   - a dependency freshness snapshot when a lockfile exists.
3. Run the project's own verification commands yourself (via `verify` or
   `terminal`) rather than trusting the script's summary. Capture the exact
   pass/fail output.
4. Rank findings by user impact:
   - **P0** build broken, tests failing, security advisory in a shipped
     dependency;
   - **P1** lint/type errors, missing tests for changed code;
   - **P2** stale dependencies, TODO clusters in hot paths;
   - **P3** polish.
5. Write the report with `file_builder` as `REPO_HEALTH.md` (markdown). Each
   finding gets: what, evidence (command + output), impact, and the smallest
   fix.

## Rules

- Read-only audit. Never upgrade dependencies or reformat code unless the user
  asks for the fixes too.
- Do not report a check as passing without the command output that proves it.
- Keep the report under 200 lines; link to files with `path:line`.
