#!/usr/bin/env bash
# Print the release range and commits since the last tag. Read-only.
set -euo pipefail

range="${1:-}"
if [ -z "$range" ]; then
  last_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  if [ -n "$last_tag" ]; then
    range="${last_tag}..HEAD"
    echo "last tag: ${last_tag}"
  else
    range="HEAD"
    echo "last tag: (none)"
  fi
fi

echo "range: ${range}"
echo
echo "## Commits"
git log --no-merges --pretty=format:'- %h %s' "$range" 2>/dev/null || true
echo
echo
echo "## Files touched"
git diff --stat "$range" 2>/dev/null | tail -40 || true
