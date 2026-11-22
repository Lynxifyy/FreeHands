---
name: dependency-upgrade-check
description: Inventory outdated and vulnerable dependencies, group them by risk, and produce a tested upgrade plan.
---

# Dependency upgrade check

Use this skill when the user asks "are our dependencies current?", "fix the
security advisories", or "plan a dependency upgrade".

## Procedure

1. Detect the ecosystems present: `package.json`/`package-lock.json`,
   `pyproject.toml`/`uv.lock`, `go.mod`, `Cargo.toml`, `Gemfile`, Gradle.
2. Run `scripts/outdated.sh` from the repository root. It prints outdated
   packages and, where the tool supports it, known vulnerabilities — read-only.
3. Classify:
   - **Security** — an advisory with a fixed version. Highest priority.
   - **Major** — breaking changes; requires reading the changelog.
   - **Minor / patch** — usually safe; still verify.
4. Read the release notes for every major bump before proposing it. Never guess
   the migration.
5. Propose a staged plan: security patches first, then patch/minor in one batch,
   then majors one at a time. For each stage list the exact command and the
   verification step (build, lint, tests).
6. Only when the user approves: perform the upgrade with the project's package
   manager, update the lockfile, and run the full verification suite. Report the
   exact output.
7. Write `DEPENDENCY_PLAN.md` with `file_builder`.

## Rules

- Never upgrade a dependency without running the project's tests afterwards.
- Do not mix a dependency upgrade with unrelated refactors.
- Prefer the lockfile-preserving command (`npm ci` for installs, `npm install
  pkg@version` for upgrades) and keep `package.json` and the lockfile in step.
- If an upgrade needs a code migration, stop and present the migration plan
  before editing.
