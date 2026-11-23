# FreeHands cloud (one host, Docker + automatic TLS)

This is the production path for a single VPS: the all-in-one FreeHands image
(frontend + agent-server + automation + coding agents) behind Caddy, with
automatic HTTPS and persistent volumes.

## Prerequisites

- A Linux host with Docker Engine 24+ and the Compose plugin.
- A DNS `A`/`AAAA` record for `FREEFHANDS_DOMAIN` pointing at the host.
- Ports 80 and 443 open.

## Deploy

```bash
git clone https://github.com/Lynxifyy/FreeHands.git
cd FreeHands/deploy/cloud
cp .env.example .env
$EDITOR .env                 # set FREEFHANDS_DOMAIN and any credentials
docker compose pull
docker compose up -d
docker compose ps
```

Open `https://$FREEFHANDS_DOMAIN/canvas`. Caddy provisions the certificate on
first request.

## What you get

- `canvas` — the all-in-one image on `:8000` (frontend, agent-server,
  automation, OpenCode for Complex Code).
- `caddy` — TLS termination, HTTP→HTTPS, compression, security headers.
- `freehands-state` — settings, secrets, conversations and the automation DB.
- `freehands-projects` — the workspace the agent edits.

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
