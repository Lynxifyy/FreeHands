#!/usr/bin/env bash
# Read-only repository health snapshot. Prints facts; it never edits files.
set -euo pipefail

root="${1:-.}"
cd "$root"

echo "## Repository"
git rev-parse --show-toplevel 2>/dev/null || echo "(not a git repository)"
echo "branch: $(git branch --show-current 2>/dev/null || echo '-')"
echo "head:   $(git rev-parse --short HEAD 2>/dev/null || echo '-')"
echo

echo "## Working tree"
git status --short 2>/dev/null | head -40 || true
echo

echo "## Recent commits"
git log --oneline -20 2>/dev/null || true
echo

echo "## TODO / FIXME / HACK"
grep -rInE 'TODO|FIXME|HACK' \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=build --exclude-dir=.venv --exclude-dir=venv \
  . 2>/dev/null | cut -d: -f1 | sort | uniq -c | sort -rn | head -30 || true
echo

echo "## Project commands"
if [ -f package.json ] && command -v node >/dev/null 2>&1; then
  node -e 'const s=require("./package.json").scripts||{}; for (const [k,v] of Object.entries(s)) console.log(`${k}: ${v}`)'
fi
if [ -f Makefile ]; then
  echo "--- Makefile targets ---"
  grep -E '^[A-Za-z0-9_.-]+:' Makefile | cut -d: -f1 | sort -u | head -40
fi
if [ -f pyproject.toml ]; then
  echo "--- pyproject ---"
  grep -nE '^\[(project|tool\.(poetry|pdm|hatch|pytest|ruff|mypy))' pyproject.toml | head -20 || true
fi
echo

echo "## Dependency freshness"
if [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then
  npm outdated --long 2>/dev/null | head -40 || true
elif [ -f pyproject.toml ] && command -v uv >/dev/null 2>&1; then
  uv pip list --outdated 2>/dev/null | head -40 || true
elif [ -f go.mod ]; then
  go list -u -m all 2>/dev/null | head -40 || true
else
  echo "(no recognised lockfile)"
fi
