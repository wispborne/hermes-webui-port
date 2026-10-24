// Exports the desktop app's English strings that the mobile app uses.
//
//   npm --prefix mobile run strings
//
// Reads apps/desktop/src/i18n/en.ts and writes mobile/src/i18n/en.generated.json.
// It needs the web UI's packages installed at the repo root (`npm ci`), because
// en.ts imports desktop code and is loaded with the root's `tsx`.
//
// Only the key prefixes in EXPORTED are written, so new sections are added on
// purpose. Function strings become templates with named placeholders:
// `session => \`Approval needed — ${session}\`` becomes "Approval needed — {session}".
// A function that picks words by a number (one notification, two notifications)
// is exported in the form it takes for numbers other than 1.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tsImport } from 'tsx/esm/api'

const EXPORTED = [
  'common',
  'notifications.native',
  'settings.connections',
  'settings.gateway',
  'settings.nav',
  'settings.vault.identifierTypes',
  'settings.vault.passwordField',
  'sidebar.filter',
  'sidebar.nav',
  'sidebar.row',
  'sidebar.searchPlaceholder',
  'sidebar.searchAria',
  'sidebar.clearSearch',
  'sidebar.noMatch',
  'sidebar.sessions',
  'sidebar.noSessions',
  'sidebar.loadMore',
  'sidebar.dateDivider'
]

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = path.join(repoRoot, 'apps/desktop/src/i18n/en.ts')
const output = path.join(repoRoot, 'mobile/src/i18n/en.generated.json')

const { en } = await tsImport(pathToFileURL(source).href, {
  parentURL: import.meta.url,
  tsconfig: path.join(repoRoot, 'apps/desktop/tsconfig.json')
})

const MARK = '\u0001'

/** The parameters of a string function: a name, or the property names it destructures. */
function parameters(fn, key) {
  const src = fn.toString()
  const list = src.match(/^(?:function\b[^(]*)?\(([^)]*)\)\s*(?:=>|\{)/)?.[1] ?? src.match(/^([A-Za-z_$][\w$]*)\s*=>/)?.[1]

  if (list === undefined) {
    throw new Error(`${key}: can't read the parameters of ${src}`)
  }

  const params = []
  let depth = 0
  let current = ''

  for (const char of list) {
    if (char === '{') depth++
    if (char === '}') depth--

    if (char === ',' && depth === 0) {
      params.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    params.push(current.trim())
  }

  return params.map(param => {
    if (/^[A-Za-z_$][\w$]*$/.test(param)) {
      return `${MARK}${param}${MARK}`
    }

    if (param.startsWith('{')) {
      return new Proxy({}, { get: (_, name) => (typeof name === 'string' ? `${MARK}${name}${MARK}` : undefined) })
    }

    throw new Error(`${key}: can't turn the parameter "${param}" into a placeholder`)
  })
}

function template(fn, key) {
  const text = fn(...parameters(fn, key))

  if (typeof text !== 'string') {
    throw new Error(`${key}: the function returned ${typeof text}, not a string`)
  }

  return text.replaceAll(new RegExp(`${MARK}([\\w$]+)${MARK}`, 'g'), '{$1}')
}

function exportValue(value, key) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'function') {
    return template(value, key)
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, exportValue(child, `${key}.${name}`)]))
  }

  throw new Error(`${key}: ${Array.isArray(value) ? 'an array' : typeof value} can't be exported`)
}

const strings = {}

for (const prefix of EXPORTED) {
  const keys = prefix.split('.')
  let value = en

  for (const key of keys) {
    value = value?.[key]
  }

  if (value === undefined) {
    throw new Error(`The desktop strings have no "${prefix}".`)
  }

  let target = strings

  for (const key of keys.slice(0, -1)) {
    target = target[key] ??= {}
  }

  target[keys.at(-1)] = exportValue(value, prefix)
}

mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(strings, null, 2)}\n`)
console.log(`Wrote ${path.relative(repoRoot, output)}.`)
