# Hermes desktop, in a browser

This folder builds the Hermes desktop app (`apps/desktop`) as a plain web page that talks to a Hermes gateway.
It replaces [przbadu/hermes-ui](https://github.com/przbadu/hermes-ui), which copied the desktop code out of the upstream repo and fell behind.

Here, the desktop code is not copied.
This repo is a fork of [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), and this folder only adds a browser build on top of it.
Pulling in upstream changes is one script and a normal `git merge`.

## How it works

The desktop app's UI expects an Electron "bridge" object, `window.hermesDesktop`, for anything that touches the machine or the backend.
The UI already supports a "remote gateway" mode, where almost everything goes over the gateway's REST API and WebSocket.
So the browser build only needs a small replacement bridge:

- `src/bridge/gateway.ts`: HTTP and WebSocket calls to the gateway, login, and session tokens.
- `src/bridge/bridge.ts`: the `window.hermesDesktop` object. Features that need the local machine (local terminal, native git, extra OS windows, app updates) are stubs that say "not available".
- `src/main.ts`: installs the bridge, then loads the unchanged desktop entry point.
- `vite.config.ts`: reuses the desktop app's own Vite config, `index.html` and `public/` folder, and points the page's script at `src/main.ts`.

No file outside `desktop-web/` is changed.
Keep it that way where possible, because every change to an upstream file is a possible merge conflict later.

## Branches

- `main` holds upstream's files without upstream's history: one snapshot commit per sync, each matching the upstream version synced. Don't commit to it by hand.
- `web` is `main` plus this folder. Work happens here.

Leaving out upstream's history keeps this repo around 80 MB instead of over 1 GB.
Syncing downloads only the one upstream commit it needs, so a local copy stays small too.

## Setup

You need Node `^22.22.0`, `^24.11.0` or `>=26.0.0`, and npm `>=11.17.0` (upstream's `package.json` requires both, and its `.npmrc` makes npm enforce it).
The npm bundled with Node may be older than that (Node 24.15 ships 11.12), so the commands below run npm 11 through `npx`.

Install from the repo root, not from `desktop-web/`.
`desktop-web/` has no packages of its own; it uses the ones the desktop app installs at the root.
`--ignore-scripts` skips downloading Electron and compiling the native terminal module, which the browser build doesn't use.

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts
```

## Build

From the repo root:

```bash
npm run build --prefix desktop-web
```

The output is `desktop-web/dist/`: static files only (`index.html`, `assets/`, and the desktop app's `public/` files).
Git is not needed. Without it, the version label still works (it comes from `UPSTREAM_VERSION`), but the version details won't show the commit hash.

## Deploy behind a reverse proxy

Serve `desktop-web/dist/` as static files and forward these to the gateway (`hermes dashboard`), on the same domain:

- `/api/*`: every REST call, plus WebSockets at `/api/ws` and `/api/plugins/*`. The proxy must pass WebSocket upgrades.
- `/auth/*`: login, logout and session refresh. The password login form posts to `/auth/password-login`.
- `/login`: the gateway's login page. Its styles and script are inline, so it loads nothing else.

Everything else is a file in `dist/`.
The app uses hash routes (`/#/settings`), so the server only ever gets `/` for the page itself.

The gateway must have login turned on (password or OAuth).
Through a proxy, the page doesn't get the session token the gateway adds when it serves its own page, so the app signs in with the gateway's login page instead.
A gateway on a loopback address only requires login when `dashboard.public_url` (or `HERMES_DASHBOARD_PUBLIC_URL`) names a non-loopback host.
That setting is also the `Host` and `Origin` the gateway accepts, so set it to the address you open the app at.

Build the UI from the same Hermes version your gateway runs. See "Pulling in upstream changes" below.

## Run it locally

You need a running gateway: `hermes dashboard` (default port 9119).

**Dev server** (live reload):

```bash
npm run dev --prefix desktop-web
```

Open http://localhost:5175.
The dev server forwards `/api`, `/auth` and `/login` to the gateway, and copies the gateway's session token into the page.
Set `HERMES_GATEWAY_URL` to use a gateway other than `http://127.0.0.1:9119`.

**Served by the gateway itself**, in place of its own dashboard:

```bash
HERMES_WEB_DIST="$PWD/desktop-web/dist" hermes dashboard --skip-build
```

## Checks

```bash
npm run typecheck --prefix desktop-web
```

This type-checks the bridge together with the whole desktop UI.
When upstream adds a required method to the bridge, this fails and names the method.

## Pulling in upstream changes

On the `web` branch, with no uncommitted changes, pass the hermes-agent release your gateway runs (the image tag), or nothing for upstream `main`:

```bash
desktop-web/scripts/sync-upstream.sh v2026.9.24
```

It adds a snapshot of that upstream version to `main`, merges `main` into `web`, records the version in `UPSTREAM_VERSION`, then installs packages, type-checks and builds.
It doesn't push. When it finishes cleanly:

```bash
git push origin main web
```

If the merge stops on a conflict, fix it, commit, then run the type check and build by hand.

If the type check fails, upstream changed the bridge.
Compare `apps/desktop/electron/preload.ts` (the Electron version) with `src/bridge/bridge.ts` and add the missing piece.

If the build fails with "apps/desktop/index.html no longer loads /src/main.tsx", upstream renamed its entry file.
Update `webEntry()` in `vite.config.ts`.

## Limits

- One gateway per browser. The desktop app can switch between several saved gateways, but a browser can only keep a login for the origin it was loaded from.
- No local terminal, native git, or file picker for the local machine. Files and git on the gateway's machine work through the gateway.
- Settings still shows desktop-only options (local gateway, Hermes Cloud, SSH). They don't work here. Hiding them means changing upstream files, so it's not done yet.
- Audio and video files on the gateway don't play. The desktop app streams them through an Electron-only `hermes-media://` address. Images and other files work.
- Not yet installable as an app (PWA). hermes-ui had this.
