#!/usr/bin/env bash
# Install the FreeHands stack as a 24/7 service on a systemd host.
#
#   sudo ./install.sh            # up, enable at boot, restart nightly at 04:00
#
# Re-running is safe: it pulls the configured image, recreates changed
# containers and re-installs the units.
set -euo pipefail

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'install.sh: %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is required"
command -v systemctl >/dev/null || die "systemd is required (use README.md's manual path otherwise)"
[ "$(id -u)" -eq 0 ] || die "run as root: sudo $0"

[ -f "$STACK_DIR/.env" ] || die "missing $STACK_DIR/.env - copy .env.example and set the domains"

# Compose refuses to start with an unset domain, so fail loudly before pulling.
# shellcheck source=/dev/null
set -a; . "$STACK_DIR/.env"; set +a
[ -n "${FREEFHANDS_DOMAIN:-}" ] || die "FREEFHANDS_DOMAIN is empty in .env"
[ -n "${FREEFHANDS_SITE_DOMAIN:-}" ] || die "FREEFHANDS_SITE_DOMAIN is empty in .env"

docker compose --project-directory "$STACK_DIR" pull
docker compose --project-directory "$STACK_DIR" up -d --remove-orphans

install -d /etc/systemd/system
for unit in freehands-stack.service freehands-restart.service freehands-restart.timer; do
  sed "s|/opt/freehands/deploy/cloud|$STACK_DIR|g" "$STACK_DIR/systemd/$unit" > "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now freehands-stack.service
systemctl enable --now freehands-restart.timer

echo
printf 'FreeHands is up.\n'
printf '  app:       https://%s\n' "$FREEFHANDS_DOMAIN"
printf '  website:   https://%s\n' "$FREEFHANDS_SITE_DOMAIN"
printf '  restart:   nightly at 04:00 (systemctl list-timers freehands-restart.timer)\n'
printf '  pin a tag: FREEFHANDS_VERSION in %s/.env for reproducible deploys\n' "$STACK_DIR"
