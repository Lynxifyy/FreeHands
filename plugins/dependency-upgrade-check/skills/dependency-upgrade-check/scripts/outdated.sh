#!/usr/bin/env bash
# Read-only dependency freshness + vulnerability snapshot.
set -euo pipefail

cd "${1:-.}"

if [ -f package.json ] && command -v npm >/dev/null 2>&1; then
  echo "## npm outdated"
  npm outdated --long 2>/dev/null || true
  echo
  echo "## npm audit (high and above)"
  npm audit --audit-level=high 2>/dev/null || true
elif [ -f pyproject.toml ] && command -v uv >/dev/null 2>&1; then
  echo "## Python outdated"
  uv pip list --outdated 2>/dev/null || true
elif [ -f requirements.txt ]; then
  echo "## Python outdated (pip)"
  python3 -m pip list --outdated 2>/dev/null || true
elif [ -f go.mod ]; then
  echo "## Go modules with updates"
  go list -u -m all 2>/dev/null || true
elif [ -f Cargo.toml ] && command -v cargo >/dev/null 2>&1; then
  echo "## Cargo outdated"
  cargo outdated 2>/dev/null || true
else
  echo "No supported dependency manifest found."
fi
