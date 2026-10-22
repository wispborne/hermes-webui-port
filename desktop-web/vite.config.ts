/**
 * Browser build of the Hermes desktop app.
 *
 * This reuses the desktop renderer's own Vite config (aliases, React compiler,
 * chunking, emoji assets) and its own index.html and public/ folder, so
 * upstream changes to those flow in with no edits here. On top of that it:
 *  - swaps the page's entry script for src/main.ts, which installs the
 *    browser bridge before loading the desktop entry;
 *  - writes the build to desktop-web/dist instead of the desktop app's folder;
 *  - in dev, proxies the gateway's routes so the page and the gateway share
 *    one origin (the gateway only accepts same-origin browsers);
 *  - adds mcp-oauth-callback.html, where MCP server sign-ins land when the web
 *    UI is open on localhost (src/bridge/mcp-oauth.ts).
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { type ConfigEnv, type Connect, defineConfig, mergeConfig, type Plugin, type UserConfig } from 'vite'

import desktopConfig from '../apps/desktop/vite.config'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '../apps/desktop')

// The gateway the dev server forwards to. Run one with `hermes dashboard`.
const GATEWAY = process.env.HERMES_GATEWAY_URL ?? 'http://127.0.0.1:9119'

// The id the page's entry script is rewritten to. Resolved below to src/main.ts.
const WEB_ENTRY_ID = '/@hermes-web/main.ts'
const WEB_ENTRY_FILE = path.resolve(here, 'src/main.ts')

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

/**
 * The upstream version this build is on, e.g. "v2026.9.24". Written to
 * UPSTREAM_VERSION by scripts/sync-upstream.sh.
 */
function upstreamVersion(): string {
  try {
    return fs.readFileSync(path.resolve(here, 'UPSTREAM_VERSION'), 'utf8').trim() || 'dev'
  } catch {
    return 'dev'
  }
}

function webEntry(): Plugin {
  return {
    name: 'hermes-web:entry',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const desktopEntry = /src="\/src\/main\.tsx"/

        if (!desktopEntry.test(html)) {
          // Upstream renamed its entry. Fail loudly instead of shipping a page
          // with no bridge.
          throw new Error('desktop-web: apps/desktop/index.html no longer loads /src/main.tsx; update webEntry()')
        }

        return html.replace(desktopEntry, `src="${WEB_ENTRY_ID}"`)
      }
    },
    resolveId: {
      // The filter keeps the bundler from calling this hook for every module.
      filter: { id: /^\/@hermes-web\// },
      handler(id) {
        return id === WEB_ENTRY_ID ? WEB_ENTRY_FILE : null
      }
    }
  }
}

const MCP_OAUTH_CALLBACK = 'mcp-oauth-callback.html'

/**
 * Serves src/mcp-oauth-callback.html at the site root: written to dist in a
 * build, answered directly by the dev and preview servers.
 */
function mcpOauthCallbackPage(): Plugin {
  const source = path.resolve(here, 'src', MCP_OAUTH_CALLBACK)

  const serve = (server: { middlewares: { use: (handler: Connect.NextHandleFunction) => void } }) => {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== `/${MCP_OAUTH_CALLBACK}`) {
        next()

        return
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(fs.readFileSync(source, 'utf8'))
    })
  }

  return {
    name: 'hermes-web:mcp-oauth-callback',
    configureServer: serve,
    configurePreviewServer: serve,
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: MCP_OAUTH_CALLBACK, source: fs.readFileSync(source, 'utf8') })
    }
  }
}

/**
 * Dev only: copy the gateway's bootstrap script (session token, auth mode)
 * into the page. When the gateway serves the app it adds this script itself;
 * under `vite dev` the page comes from Vite, so without this you'd have to
 * pass `?token=` by hand.
 */
function gatewayBootstrap(): Plugin {
  return {
    name: 'hermes-web:gateway-bootstrap',
    apply: 'serve',
    async transformIndexHtml(html) {
      try {
        const page = await (await fetch(`${GATEWAY}/`, { signal: AbortSignal.timeout(3_000) })).text()
        const script = page.match(/<script>[^<]*__HERMES_AUTH_REQUIRED__[^<]*<\/script>/)?.[0]

        if (script) {
          return html.replace('</head>', `${script}</head>`)
        }

        console.warn(`[desktop-web] ${GATEWAY}/ has no bootstrap script; is it a \`hermes dashboard\`?`)
      } catch (error) {
        console.warn(`[desktop-web] could not reach the gateway at ${GATEWAY}: ${String(error)}`)
      }

      return html
    }
  }
}

export default defineConfig(async (env: ConfigEnv) => {
  const desktop: UserConfig =
    typeof desktopConfig === 'function' ? await desktopConfig(env) : await desktopConfig

  const gatewayProxy = { target: GATEWAY, changeOrigin: false, secure: false }

  return mergeConfig(desktop, {
    root: desktopRoot,
    cacheDir: path.resolve(here, 'node_modules/.vite'),
    plugins: [webEntry(), gatewayBootstrap(), mcpOauthCallbackPage()],
    define: {
      __HERMES_WEB_VERSION__: JSON.stringify(upstreamVersion()),
      __HERMES_WEB_COMMIT__: JSON.stringify(git('rev-parse', '--short', 'HEAD'))
    },
    build: {
      outDir: path.resolve(here, 'dist'),
      emptyOutDir: true
    },
    server: {
      // A different port from the desktop dev server (5174), so both can run.
      port: 5175,
      proxy: {
        '/api/ws': { ...gatewayProxy, ws: true },
        '/api': gatewayProxy,
        '/auth': gatewayProxy,
        '/login': gatewayProxy
      }
    },
    preview: {
      port: 4175
    }
  } satisfies UserConfig)
})
