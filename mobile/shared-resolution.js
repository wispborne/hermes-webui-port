// How the app finds apps/shared, used by both Metro and Jest.
//
// apps/shared isn't installed in node_modules (see docs/adr/0002). So
// `@hermes/shared` and `@hermes/shared/<name>` are mapped to its source files.
// `@hermes/desktop-themes/<name>` is mapped to apps/desktop/src/themes, for the
// few desktop theme files that import nothing else from the desktop.
// The shared files import each other as `./name.js` while the files end in
// `.ts`. TypeScript accepts that, but Metro and Jest don't, so a relative
// `.js` import that doesn't exist is retried as `.ts`.

const fs = require('node:fs')
const path = require('node:path')

const sharedRoot = path.resolve(__dirname, '../apps/shared')
const sharedSrc = path.join(sharedRoot, 'src')
const desktopThemesRoot = path.resolve(__dirname, '../apps/desktop/src/themes')

/** The file a `@hermes/shared` or `@hermes/desktop-themes` import points to, or null for any other import. */
function hermesSharedFile(moduleName) {
  if (moduleName === '@hermes/shared') {
    return path.join(sharedSrc, 'index.ts')
  }

  if (moduleName.startsWith('@hermes/shared/')) {
    return path.join(sharedSrc, `${moduleName.slice('@hermes/shared/'.length)}.ts`)
  }

  if (moduleName.startsWith('@hermes/desktop-themes/')) {
    return path.join(desktopThemesRoot, `${moduleName.slice('@hermes/desktop-themes/'.length)}.ts`)
  }

  return null
}

/** For a relative `./name.js` import whose file is missing, the `./name.ts` import to try instead. */
function tsFallback(moduleName, fromFile) {
  if (!moduleName.startsWith('.') || !moduleName.endsWith('.js')) {
    return null
  }

  const dir = path.dirname(fromFile)

  if (fs.existsSync(path.resolve(dir, moduleName))) {
    return null
  }

  const ts = `${moduleName.slice(0, -'.js'.length)}.ts`

  return fs.existsSync(path.resolve(dir, ts)) ? ts : null
}

module.exports = { desktopThemesRoot, hermesSharedFile, sharedRoot, tsFallback }
