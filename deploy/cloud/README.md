# FreeHands cloud (one host, Docker + automatic TLS)

This is the production path for a single always-on host: the all-in-one
FreeHands image (frontend + agent-server + automation + coding agents) and the
marketing site behind Caddy, with automatic HTTPS and persistent volumes.

## Prerequisites

- A Linux host with Docker Engine 24+ and the Compose plugin.
- A DNS `A`/`AAAA` record for `FREEFHANDS_DOMAIN` (app) and
  `FREEFHANDS_SITE_DOMAIN` (website), both pointing at the host.
- Ports 80 and 443 open.

## Deploy

```bash
git clone https://github.com/Lynxifyy/FreeHands.git
cd FreeHands/deploy/cloud
cp .env.example .env
$EDITOR .env                 # set both domains and any credentials
docker compose pull
docker compose up -d
docker compose ps
```

Open `https://$FREEFHANDS_DOMAIN/canvas` for the app and
`https://$FREEFHANDS_SITE_DOMAIN` for the website. Caddy provisions both
certificates on first request.

To run it unattended, use the installer instead - it does the same `up -d` and
adds the boot unit and the nightly restart:

```bash
sudo ./install.sh
```

## What you get

- `canvas` — the all-in-one image on `:8000` (frontend, agent-server,
  automation, OpenCode for Complex Code).
- `site` — nginx serving `website/` read-only, so `git pull` publishes new copy.
- `caddy` — TLS termination, HTTP→HTTPS, compression, security headers.
- `freehands-state` — settings, secrets, conversations and the automation DB.
- `freehands-projects` — the workspace the agent edits.

## Keep it running 24/7

Every service already declares `restart: unless-stopped`, a healthcheck and
10 MB × 3 log rotation, so a crashed container comes back and a reboot
restores the stack once Docker is up. Two extras make it hands-off:

```bash
sudo ./install.sh
```

- `freehands-stack.service` — `docker compose up -d` at boot, so the stack is
  restored even if a container was removed while the host was down.
- `freehands-restart.timer` — restarts the stack every night at 04:00 with up
  to 10 minutes of jitter (`Persistent=true`, so a missed restart runs after
  the host comes back).

```bash
systemctl status freehands-stack.service
systemctl list-timers freehands-restart.timer
journalctl -u freehands-stack.service -f
```

`install.sh` is idempotent and re-installs the units on every run. Change the
restart time by editing `OnCalendar` in `systemd/freehands-restart.timer` and
running it again.

Host choice matters: a machine that sleeps or gets recycled is not an
always-on host. Use a VPS, a home server or any box that stays powered, and
keep the state on the `freehands-state` volume - that volume is the backup
target, not the container.

## Update

```bash
docker compose pull
docker compose up -d
```

Pin `FREEFHANDS_VERSION` to a release tag for reproducible deployments.

## Backup

```bash
docker run --rm -v freehands_freehands-state:/data -v "$PWD":/backup \
  alpine tar czf /backup/freehands-state.tgz -C /data .
```

## Security notes

- Keep `AGENT_CANVAS_ALLOW_LAN_SESSION_KEY=false` on a public host. The UI asks
  for the session key; the entrypoint persists it in the state volume.
- The container runs as the non-root `openhands` user with
  `no-new-privileges`.
- Put the host behind a firewall that only exposes 22, 80 and 443.
- `MOBILESANDBOX_API_KEY` is passed to the bundled Mobilebox tools; without it
  those tools return a setup hint instead of a phone.
- OpenCode credentials can be an `OPENCODE_API_KEY` or the full
  `OPENCODE_AUTH_CONTENT` JSON blob from `~/.local/share/opencode/auth.json`.
