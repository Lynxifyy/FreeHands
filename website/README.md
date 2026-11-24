# FreeHands website

A static marketing site for FreeHands. No build step and no dependencies: open
`index.html` or serve the folder.

```bash
python3 -m http.server 12001 --directory website
```

Deploy by publishing the `website/` directory to any static host (GitHub Pages,
Cloudflare Pages, S3), or serve it alongside the app from the always-on Docker
stack in [`deploy/cloud`](../deploy/cloud/README.md) - that path adds `nginx`,
`restart: unless-stopped`, a boot unit and a nightly restart.

## Files

- `index.html` — page structure and copy
- `styles.css` — layout, theme and motion
- `assets/oli.svg` — favicon and brand mark

The install command on the page matches the image tag in the repository
`README.md`; update both together when cutting a release.
