#!/usr/bin/env node
// Helpers for scripts/sync-upstream.sh. Run from the repo root.
//
//   node desktop-web/scripts/upstream.mjs tree <commit>
//     Builds a git tree holding only the upstream files the web UI build
//     needs, and prints its id.
//
//   node desktop-web/scripts/upstream.mjs package <commit>
//     Writes this repo's root package.json, taking `engines` and `overrides`
//     from upstream's, and copies upstream's package-lock.json in as the
//     starting point for `npm install --package-lock-only`.

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Upstream files the build uses. Everything else upstream is left out.
const KEEP_FILES = [
  'LICENSE',
  '.npmrc',
  'apps/desktop/index.html',
  'apps/desktop/package.json',
  'apps/desktop/tsconfig.json',
  'apps/desktop/vite.config.ts'
]

const KEEP_DIRS = ['apps/desktop/src/', 'apps/desktop/public/', 'apps/shared/']

// The UI imports a few type files from the Electron folder. These are found by
// following imports, so a newer upstream that imports more still builds.
const ELECTRON_DIR = 'apps/desktop/electron/'

const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30, ...options })

function listTree(commit) {
  return git(['ls-tree', '-r', '-z', commit])
    .split('\0')
    .filter(Boolean)
    .map(line => {
      const [meta, file] = line.split('\t')
      const [mode, type, id] = meta.split(' ')

      return { file, id, mode, type }
    })
    .filter(entry => entry.type === 'blob')
}

/** Reads many blobs with one `git cat-file --batch`. */
function readBlobs(ids) {
  const out = spawnSync('git', ['cat-file', '--batch'], { input: ids.join('\n') + '\n', maxBuffer: 1 << 30 }).stdout
  const texts = []
  let at = 0

  while (at < out.length) {
    const headerEnd = out.indexOf(10, at)
    const size = Number(out.toString('utf8', at, headerEnd).split(' ')[2])
    texts.push(out.toString('utf8', headerEnd + 1, headerEnd + 1 + size))
    at = headerEnd + 1 + size + 1
  }

  return texts
}

const IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

function relativeImports(file, text) {
  return [...text.matchAll(IMPORT)].map(match => path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])))
}

function keptEntries(commit) {
  const entries = listTree(commit)
  const byFile = new Map(entries.map(entry => [entry.file, entry]))
  const kept = new Map()

  for (const entry of entries) {
    if (KEEP_FILES.includes(entry.file) || KEEP_DIRS.some(dir => entry.file.startsWith(dir))) {
      kept.set(entry.file, entry)
    }
  }

  const isScript = file => /\.(ts|tsx|mts|cts)$/.test(file)
  let toScan = [...kept.values()].filter(entry => isScript(entry.file))

  while (toScan.length > 0) {
    const texts = readBlobs(toScan.map(entry => entry.id))
    const found = []

    toScan.forEach((entry, index) => {
      for (const target of relativeImports(entry.file, texts[index])) {
        if (!target.startsWith(ELECTRON_DIR)) {
          continue
        }

        const match = [target, `${target}.ts`, `${target}.d.ts`, `${target}/index.ts`]
          .map(candidate => byFile.get(candidate))
          .find(Boolean)

        if (match && !kept.has(match.file)) {
          kept.set(match.file, match)
          found.push(match)
        }
      }
    })

    toScan = found.filter(entry => isScript(entry.file))
  }

  return [...kept.values()]
}

function buildTree(commit) {
  const indexFile = path.join(os.tmpdir(), `hermes-web-ui-index-${process.pid}`)
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }

  try {
    git(['read-tree', '--empty'], { env })
    const info = keptEntries(commit)
      .map(entry => `${entry.mode} ${entry.id}\t${entry.file}`)
      .join('\n')
    git(['update-index', '--index-info'], { env, input: info + '\n' })

    return git(['write-tree'], { env }).trim()
  } finally {
    fs.rmSync(indexFile, { force: true })
  }
}

function writePackage(commit) {
  const upstream = JSON.parse(git(['show', `${commit}:package.json`]))

  const pkg = {
    name: 'hermes-web-ui',
    private: true,
    description: 'The Hermes desktop app as a web UI for your Hermes gateway.',
    license: 'MIT',
    workspaces: ['apps/shared', 'apps/desktop'],
    scripts: {
      dev: 'npm run dev --prefix desktop-web',
      build: 'npm run build --prefix desktop-web',
      preview: 'npm run preview --prefix desktop-web',
      typecheck: 'npm run typecheck --prefix desktop-web',
      'sync-upstream': 'bash desktop-web/scripts/sync-upstream.sh'
    },
    // Copied from upstream's root package.json on every sync.
    engines: upstream.engines,
    overrides: upstream.overrides
  }

  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
  fs.writeFileSync('package-lock.json', git(['show', `${commit}:package-lock.json`]))
}

const [command, commit] = process.argv.slice(2)

if (command === 'tree' && commit) {
  console.log(buildTree(commit))
} else if (command === 'package' && commit) {
  writePackage(commit)
} else {
  console.error('usage: upstream.mjs tree|package <commit>')
  process.exit(2)
}
