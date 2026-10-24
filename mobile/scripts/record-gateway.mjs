// Records the WebSocket traffic of one short chat with a real gateway, for the
// fake gateway in mobile/test/fake-gateway.ts to play back.
//
//   cd mobile
//   node scripts/record-gateway.mjs --url https://hermes.example.com --username you
//
// It asks for the password (or reads HERMES_PASSWORD). Then it signs in, starts
// a new session, sends one message, waits for the reply, and opens the session
// again with session.resume. Every frame in both directions is saved to
// test/fixtures/recorded-chat.json.
//
// Text is replaced before saving: every letter, digit and symbol in message
// text, titles, previews, paths, commands and similar fields becomes "x", and
// spaces and line breaks are kept. So streamed pieces still add up to the final
// text. Pass --keep-text to save the text as it is.
//
// Check the file before committing it. The session it made stays on the
// gateway unless you pass --delete-session.
//
// Options:
//   --url <gateway URL>       required
//   --username <name>         required
//   --message <text>          what to send (default: "Reply with one short sentence.")
//   --out <file>              where to save (default: test/fixtures/recorded-chat.json)
//   --keep-text               don't replace text
//   --delete-session          delete the session afterwards

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import WebSocket from 'ws'

const { values: options } = parseArgs({
  options: {
    url: { type: 'string' },
    username: { type: 'string' },
    message: { type: 'string', default: 'Reply with one short sentence.' },
    out: { type: 'string' },
    'keep-text': { type: 'boolean', default: false },
    'delete-session': { type: 'boolean', default: false }
  }
})

if (!options.url || !options.username) {
  console.error('Usage: node scripts/record-gateway.mjs --url <gateway URL> --username <name> [--keep-text]')
  process.exit(1)
}

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.resolve(options.out ?? path.join(mobileRoot, 'test/fixtures/recorded-chat.json'))
const base = options.url.replace(/\/+$/, '')
const TURN_TIMEOUT_MS = 5 * 60_000

// Free-text fields. Their string values (and everything inside them) are replaced unless --keep-text.
const TEXT_FIELDS = new Set([
  'args',
  'assistant',
  'command',
  'content',
  'context',
  'cwd',
  'description',
  'error',
  'inline_diff',
  'message',
  'path',
  'preview',
  'question',
  'reasoning',
  'result_text',
  'summary',
  'text',
  'title',
  'user',
  'warning'
])

const mask = text => text.replace(/\S/g, 'x')

function maskValue(value) {
  if (typeof value === 'string') return mask(value)
  if (Array.isArray(value)) return value.map(maskValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskValue(v)]))
  return value
}

function maskFrame(value) {
  if (Array.isArray(value)) return value.map(maskFrame)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, TEXT_FIELDS.has(key) ? maskValue(child) : maskFrame(child)])
  )
}

async function askPassword() {
  if (process.env.HERMES_PASSWORD) {
    return process.env.HERMES_PASSWORD
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const question = `Password for ${options.username}: `
  // Print the question, then nothing while the password is typed.
  rl._writeToOutput = text => rl.output.write(text.startsWith(question) ? question : '')

  const password = await new Promise(resolve => rl.question(question, resolve))
  rl.close()
  process.stdout.write('\n')

  return password
}

async function json(response, what) {
  if (!response.ok) {
    throw new Error(`${what} answered ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

// 1. Sign in with a password and keep the cookies.
const status = await json(await fetch(`${base}/api/status`), 'GET /api/status')
console.log(`Gateway runs Hermes ${status.version}.`)

const { providers = [] } = await json(await fetch(`${base}/api/auth/providers`), 'GET /api/auth/providers')
const provider = providers.find(p => p.supports_password)

if (!provider) {
  throw new Error('The gateway has no password sign-in.')
}

const login = await fetch(`${base}/auth/password-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: provider.name, username: options.username, password: await askPassword() })
})
await json(login, 'Sign in')

const cookie = login.headers
  .getSetCookie()
  .map(line => line.split(';')[0])
  .join('; ')

const { ticket } = await json(
  await fetch(`${base}/api/auth/ws-ticket`, { method: 'POST', headers: { Cookie: cookie } }),
  'POST /api/auth/ws-ticket'
)

// 2. Open the WebSocket and record every frame.
const frames = []
const started = Date.now()
const wsUrl = `${base.replace(/^http/, 'ws')}/api/ws`
const socket = new WebSocket(wsUrl, ['hermes-gateway-v1', `hermes-gateway-ticket.${ticket}`])
const waiting = new Map()
let nextId = 1

const record = (from, frame) =>
  frames.push({ from, at: Date.now() - started, frame: options['keep-text'] ? frame : maskFrame(frame) })

function send(frame) {
  record('client', frame)
  socket.send(JSON.stringify(frame))
}

function request(method, params = {}) {
  const id = `r${nextId++}`
  send({ jsonrpc: '2.0', id, method, params })

  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }))
}

const eventWaiters = []
const nextEvent = (test, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the gateway.')), timeoutMs)
    eventWaiters.push({ test, resolve: event => (clearTimeout(timer), resolve(event)) })
  })

socket.on('message', data => {
  const frame = JSON.parse(String(data))
  record('server', frame)

  if (frame.method === 'event') {
    for (const waiter of [...eventWaiters]) {
      if (waiter.test(frame.params)) {
        eventWaiters.splice(eventWaiters.indexOf(waiter), 1)
        waiter.resolve(frame.params)
      }
    }
  } else if (frame.method !== undefined && frame.id !== undefined) {
    // A server request, such as an approval. Decline it as "not shown here", so the
    // recorder never answers for the person. GATEWAY_PROTOCOL.md section 9.
    send({ jsonrpc: '2.0', id: frame.id, error: { code: 4404, message: 'not shown here' } })
  } else if (frame.id !== undefined && waiting.has(frame.id)) {
    const { resolve, reject } = waiting.get(frame.id)
    waiting.delete(frame.id)
    frame.error ? reject(new Error(`${frame.error.code}: ${frame.error.message}`)) : resolve(frame.result)
  }
})

const closed = new Promise(resolve => socket.on('close', code => resolve(code)))
await new Promise((resolve, reject) => {
  socket.once('open', resolve)
  socket.once('error', reject)
})

const ready = await nextEvent(event => event.type === 'gateway.ready', 15_000)
await request('client.capabilities', { server_requests: true })
const heartbeat = ready.payload?.heartbeat ? setInterval(() => request('gateway.ping').catch(() => {}), 15_000) : null

try {
  // 3. Start a session, send the message, wait for the turn to end.
  const created = await request('session.create', {})
  console.log(`Started session ${created.stored_session_id}.`)

  const complete = nextEvent(
    event => event.type === 'message.complete' && event.session_id === created.session_id,
    TURN_TIMEOUT_MS
  )
  await request('prompt.submit', { session_id: created.session_id, text: options.message })
  const done = await complete
  console.log(`The turn ended with status "${done.payload?.status}".`)

  // 4. Open it again, the way the app opens a saved session.
  await request('session.resume', { session_id: created.stored_session_id })

  if (options['delete-session']) {
    await request('session.delete', { session_id: created.stored_session_id })
    console.log('Deleted the session.')
  }
} finally {
  if (heartbeat) clearInterval(heartbeat)
  socket.close()
  await closed
}

const recording = {
  description: `Recorded from a Hermes ${status.version} gateway: sign in, session.create, prompt.submit, message.complete, session.resume.${options['keep-text'] ? '' : ' Text replaced with x.'}`,
  hermesVersion: status.version,
  recordedAt: new Date().toISOString(),
  frames
}

writeFileSync(outFile, `${JSON.stringify(recording, null, 2)}\n`)
console.log(`Saved ${frames.length} frames to ${path.relative(process.cwd(), outFile)}. Check it before committing it.`)
