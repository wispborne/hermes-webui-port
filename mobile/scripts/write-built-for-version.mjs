// Writes the Hermes version the app is built for, from desktop-web/UPSTREAM_VERSION.
//
//   npm --prefix mobile run built-for-version
//
// The upstream sync runs this, so the app's version banner compares the
// gateway with the Hermes version the shared code came from.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const upstream = readFileSync(path.join(repoRoot, 'desktop-web/UPSTREAM_VERSION'), 'utf8').trim()
const version = upstream.replace(/^v(?=\d)/, '')
const output = path.join(repoRoot, 'mobile/src/gateway/built-for-version.ts')

writeFileSync(
  output,
  `// Written by scripts/write-built-for-version.mjs from desktop-web/UPSTREAM_VERSION. Don't edit.\n` +
    `export const BUILT_FOR_HERMES_VERSION = '${version.replaceAll(/['\\]/g, '\\$&')}'\n`
)
console.log(`Built for Hermes ${version}.`)
