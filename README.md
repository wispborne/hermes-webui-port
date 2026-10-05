# Hermes Web UI

The [Hermes Agent](https://github.com/NousResearch/hermes-agent) desktop app, in your browser.

Host it next to your Hermes dashboard and use the full desktop interface from any browser: chat, sessions, bots, scheduled jobs, files, and settings.
It's built from the desktop app's own source and talks to your dashboard's API, so your sessions, profiles and settings are the ones you already have.

## Requirements

- A running Hermes dashboard (`hermes dashboard`, port 9119 by default).
- The dashboard's login turned on: password or OAuth. You sign in to the web UI with that login.
- The dashboard's `public_url` set to the address you'll open the web UI at.
- The same Hermes version the web UI is built for. It's in [`desktop-web/UPSTREAM_VERSION`](desktop-web/UPSTREAM_VERSION). See [Other Hermes versions](#other-hermes-versions) to build for a different one.

## Set up the Hermes dashboard

**Login.** For password login, set these in the dashboard's environment:

```bash
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=you
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=a-long-password
HERMES_DASHBOARD_BASIC_AUTH_SECRET=a-long-random-string
```

The secret keeps you signed in across dashboard restarts.
The same settings can go in `config.yaml` under `dashboard.basic_auth` (`username`, `password` or `password_hash`, `secret`).
For OAuth, see the [Hermes dashboard docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard#authentication-gated-mode).

**Public URL.** Set it to the web UI's address:

```yaml
dashboard:
  public_url: https://hermes.example.com
```

Or set `HERMES_DASHBOARD_PUBLIC_URL`.
The dashboard accepts requests only for that host name, and it turns login on even when the dashboard listens on `127.0.0.1`.

Restart the dashboard after changing either.

## Install with Docker

The image builds the web UI and serves it with [Caddy](https://caddyserver.com), which also forwards the dashboard's routes so the browser sees one address.

```bash
git clone https://github.com/wispborne/hermes-webui-port.git
cd hermes-webui-port
docker build -t hermes-web-ui .
docker run -d --name hermes-web-ui --restart unless-stopped --network host \
  -e HERMES_DASHBOARD_URL=http://127.0.0.1:9119 \
  -e PORT=8080 \
  hermes-web-ui
```

The web UI is now on port 8080.

| Variable | Default | What it is |
| --- | --- | --- |
| `HERMES_DASHBOARD_URL` | `http://127.0.0.1:9119` | The Hermes dashboard, as seen from the container. |
| `PORT` | `8080` | The port the web UI is served on. |

With Docker Compose, Docker can build straight from the repository:

```yaml
services:
  hermes-web-ui:
    build: https://github.com/wispborne/hermes-webui-port.git#main
    network_mode: host
    environment:
      HERMES_DASHBOARD_URL: http://127.0.0.1:9119
      PORT: "8080"
    restart: unless-stopped
```

Each Hermes release has a matching tag, `ui-<Hermes version>`, for example `ui-v2026.9.24`.
Replace `#main` with the tag for your Hermes version.
A fix for the same Hermes version moves its tag, so rebuilding picks the fix up.

If the dashboard runs in another container on the same Docker network, drop `network_mode: host`, publish the port (`ports: ["8080:8080"]`), and point `HERMES_DASHBOARD_URL` at that container, for example `http://hermes:9119`.

### HTTPS

Put your usual reverse proxy in front of port 8080 for HTTPS, and keep the original `Host` header (most proxies do by default).
With Caddy:

```
hermes.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

The address you open must match the dashboard's `public_url`.

## Install without Docker

You need Node `^22.22.0`, `^24.11.0` or `>=26.0.0`, and npm `11.17` or newer.
The commands below run npm 11 through `npx`, so an older npm that came with Node is fine.

```bash
git clone https://github.com/wispborne/hermes-webui-port.git
cd hermes-webui-port
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts
npm run build
```

The built web UI is in `desktop-web/dist/`: static files only.
Serve that folder from a web server that also forwards these paths to the dashboard, on the same domain:

| Path | What it is |
| --- | --- |
| `/api/*` | The REST API, plus WebSockets at `/api/ws` and `/api/plugins/*`. Forward WebSocket upgrades. |
| `/auth/*` | Sign-in, sign-out and session refresh. |
| `/login` | The dashboard's sign-in page. |

Everything else is a file in `desktop-web/dist/`.
The app uses hash routes (`/#/settings`), so the server only needs to serve `index.html` at `/`.
The [`Caddyfile`](Caddyfile) in this repo is a working example.

## Sign in

Open the web UI's address.
You'll see "Remote gateway sign-in required" with a sign-in button, which opens the dashboard's sign-in page.
After you sign in, you're returned to the app.
If you're already signed in to the dashboard on that address, the app opens straight away.

## Updating

```bash
git pull
docker build -t hermes-web-ui .
docker rm -f hermes-web-ui
```

Then run the `docker run` command again.
Without Docker, run the install commands again after `git pull`.

## Other Hermes versions

The web UI works best with the Hermes version it's built for (in [`desktop-web/UPSTREAM_VERSION`](desktop-web/UPSTREAM_VERSION)).
To build for another release, pass its tag, which is the same as the `nousresearch/hermes-agent` image tag:

```bash
npm run sync-upstream -- v2026.9.24
```

This needs Git and Bash, and runs on the `main` branch with no uncommitted changes.
It brings in the desktop app's source from that release, updates the packages to match, then type-checks and builds.
Then build the Docker image as above.

## Development

```bash
npm run dev
```

The dev server runs on http://localhost:5175 and forwards `/api`, `/auth` and `/login` to the dashboard at `http://127.0.0.1:9119`.
Set `HERMES_GATEWAY_URL` to use another one.
If the dashboard's login is off, the dev server also passes along its session token, so no sign-in is needed.

```bash
npm run typecheck
```

This type-checks the browser code together with the whole desktop app.

### How it's put together

- `apps/desktop/` and `apps/shared/`: the Hermes desktop app's source, from [hermes-agent](https://github.com/NousResearch/hermes-agent). Only the files the build uses are included. Leave these unchanged so updates merge cleanly.
- `desktop-web/src/bridge/`: the browser's version of the bridge the desktop app uses to reach its backend (`window.hermesDesktop`). It sends everything to the dashboard over HTTP and WebSockets, and handles sign-in.
- `desktop-web/vite.config.ts`: builds the desktop app with its own Vite config and `index.html`, loading the bridge first.
- `desktop-web/scripts/`: `sync-upstream.sh` and `upstream.mjs`, which bring in a hermes-agent version.
- `Dockerfile` and `Caddyfile`: the container image.

The `hermes-agent` branch holds the hermes-agent files the UI is built from, one commit per version synced.
`npm run sync-upstream` adds the next one and merges it into `main`, then regenerates `package.json` and `package-lock.json` from upstream's, with the same package versions.
For a release tag, it also tags the result `ui-<tag>`, moving the tag if it exists.
Publish with `git push origin hermes-agent main`, then `git push --force origin ui-<tag>`.
After a fix for the same Hermes version, move its tag the same way: `git tag -f ui-<tag>`, then push it with `--force`.

If the merge stops on a conflict, fix it, commit, then run the sync again with the same version.

If the type check fails after a sync, the desktop app's bridge declaration changed (`apps/desktop/src/global.d.ts`).
For a newer version, add the new field to `desktop-web/src/bridge/bridge.ts`. Upstream's Electron version, [`apps/desktop/electron/preload.ts`](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/preload.ts), shows what it does.
For an older version, remove the field it lacks.

## Known issues

- Audio and video files from the dashboard's machine don't play. Images and other files work.
- The gateway settings list the desktop app's connection modes (Local, Hermes Cloud, SSH). Only Remote gateway applies here.

## License

MIT. See [`LICENSE`](LICENSE).
The Hermes desktop app source in `apps/` is by [Nous Research](https://nousresearch.com).
