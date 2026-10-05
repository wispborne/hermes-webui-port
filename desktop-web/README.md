# Hermes desktop, in a browser

This folder builds the Hermes desktop app (`apps/desktop`) as a plain web page that talks to a Hermes gateway.
It replaces [przbadu/hermes-ui](https://github.com/przbadu/hermes-ui), which copied the desktop code out of the upstream repo and fell behind.

Here, the desktop code is not copied.
This repo is a fork of [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), and this folder only adds a browser build on top of it.
Pulling in upstream changes is a normal `git merge`.

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

- `main` is an exact copy of upstream `main`. Don't commit to it.
- `web` is `main` plus this folder. Work happens here.

## Setup

You need Node 24 and npm 11.17 or newer (upstream's `package.json` requires it).
If your npm is older, use `npx -y npm@11` in place of `npm` for the install.

Install from the repo root.
`--ignore-scripts` skips downloading Electron and compiling the native terminal module, which the browser build doesn't use.

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts
```

## Run it

You need a running gateway: `hermes dashboard` (default port 9119).

**Dev server** (live reload):

```bash
npm run dev --prefix desktop-web
```

Open http://localhost:5175.
The dev server forwards `/api`, `/auth` and `/login` to the gateway, and copies the gateway's session token into the page.
Set `HERMES_GATEWAY_URL` to use a gateway other than `http://127.0.0.1:9119`.

**Served by the gateway** (the normal way to use it):

```bash
npm run build --prefix desktop-web
HERMES_WEB_DIST="$PWD/desktop-web/dist" hermes dashboard --skip-build
```

The gateway then serves this app in place of its own dashboard, at its own address.
It adds the session token to the page, and its login (OAuth or password) works as normal.

The browser must load the app from the same origin as the gateway.
The gateway's login cookie and WebSocket origin check don't allow anything else.
A reverse proxy that serves both on one domain also works.

## Checks

```bash
npm run typecheck --prefix desktop-web
```

This type-checks the bridge together with the whole desktop UI.
When upstream adds a required method to the bridge, this fails and names the method.

## Pulling in upstream changes

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout web && git merge main
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts
npm run typecheck --prefix desktop-web
npm run build --prefix desktop-web
git push origin web
```

If the type check fails, upstream changed the bridge.
Compare `apps/desktop/electron/preload.ts` (the Electron version) with `src/bridge/bridge.ts` and add the missing piece.

If the build fails with "apps/desktop/index.html no longer loads /src/main.tsx", upstream renamed its entry file.
Update `webEntry()` in `vite.config.ts`.

## Limits

- One gateway per browser. The desktop app can switch between several saved gateways, but a browser can only keep a login for the origin it was loaded from.
- No local terminal, native git, or file picker for the local machine. Files and git on the gateway's machine work through the gateway.
- Settings still shows desktop-only options (local gateway, Hermes Cloud, SSH). They don't work here. Hiding them means changing upstream files, so it's not done yet.
- Not yet installable as an app (PWA). hermes-ui had this.
