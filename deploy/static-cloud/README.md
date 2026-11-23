# Static cloud (frontend only + your own agent server)

The Canvas frontend is a static SPA. If you already run an agent-server
(anywhere reachable over HTTPS), host the frontend on a CDN instead of the
all-in-one image.

## Build

```bash
VITE_BACKEND_BASE_URL=https://agent.example.com npm run build:app
```

Deploy `build/client/` to Cloudflare Pages, Vercel, Netlify, S3 + CloudFront,
or any static host. Configure an SPA fallback so unknown paths serve
`index.html`.

## Agent server

- Allow the static origin in the agent-server's `allow_cors_origins`.
- Serve it over HTTPS (the frontend is HTTPS; mixed content is blocked).
- Set `VITE_AUTH_REQUIRED=true` at build time if the backend expects a session
  key, so the UI shows the key entry screen.

## Trade-offs

- The static path is the cheapest and fastest to serve.
- It has no bundled automation service or local agent-server; point Canvas at
  an existing agent-server.
- The all-in-one Docker image remains the simplest single-host option.
