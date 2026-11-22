---
name: git-release-notes
description: Generate release notes from git history since the last tag, grouped into breaking changes, features, fixes and chores.
---

# Release notes from git history

Use this skill when the user asks for release notes, a changelog entry, or
"what changed since the last release".

## Procedure

1. Run `scripts/collect.sh` from the repository root. It prints the latest tag,
   the commits since it, and the files each commit touched — read-only.
2. If the range is huge, group by area (frontend, backend, docs, CI) instead of
   listing every commit.
3. Classify each change by reading the commit and, when needed, the diff:
   - **Breaking** — public API, config, or data-format changes.
   - **Features** — new user-visible capability.
   - **Fixes** — corrected behaviour.
   - **Performance**, **Docs**, **Chores**, **CI**.
4. Write `RELEASE_NOTES.md` with `file_builder`. Link PR/issue numbers when the
   commit message carries them. Do not invent entries or attribution.
5. If the user wants a version bump, propose semver based on the classification
   and ask before changing manifests.

## Rules

- Never rewrite history or tag a release without explicit approval.
- Skip merge commits and release-please noise unless they carry user-facing
  changes.
- Prefer user language over commit jargon: "Fix crash when opening large repos",
  not "guard null in openRepo()".
