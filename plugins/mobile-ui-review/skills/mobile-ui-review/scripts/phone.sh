#!/usr/bin/env bash
# Minimal Mobilebox REST helper. Requires MOBILESANDBOX_API_KEY in the env.
# Never prints the key.
set -euo pipefail

api="https://mobilebox.dev/v1"
key="${MOBILESANDBOX_API_KEY:-}"

if [ -z "$key" ]; then
  echo "MOBILESANDBOX_API_KEY is not set" >&2
  exit 1
fi

auth=(-H "Authorization: Bearer ${key}")

usage() {
  cat <<'USAGE'
Usage:
  phone.sh create [name]   create an Android phone and print its id + viewer URL
  phone.sh observe <id>    print the current screen
  phone.sh shot <id> <out> save a screenshot PNG to <out>
  phone.sh park <id>       park the phone (free, keeps state)
  phone.sh delete <id>     delete the phone
USAGE
}

cmd="${1:-}"
case "$cmd" in
  create)
    name="${2:-freehands-review}"
    body="$(printf '{"name":"%s"}' "$name")"
    curl -sS -X POST "${api}/phones?wait=ready" "${auth[@]}" \
      -H 'content-type: application/json' -d "$body"
    ;;
  observe)
    curl -sS "${api}/phones/${2:?id required}/observe" "${auth[@]}"
    ;;
  shot)
    curl -sS "${api}/phones/${2:?id required}/screenshot" "${auth[@]}" -o "${3:?output path required}"
    echo "saved ${3}"
    ;;
  park)
    curl -sS -X POST "${api}/phones/${2:?id required}/park" "${auth[@]}"
    ;;
  delete)
    curl -sS -X DELETE "${api}/phones/${2:?id required}" "${auth[@]}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
