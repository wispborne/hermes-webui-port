// A pretend Hermes gateway for trying the app on an emulator without a real
// one. It serves the REST routes and the WebSocket the app uses, with made-up
// sessions, and plays scripted replies.
//
//   cd mobile
//   node scripts/demo-gateway.mjs [--port 8787] [--detach]
//
// --detach acts like a gateway with a session authority: session.resume
// answers carry a subscription_id, and session.detach drops one client from a
// session. Without it, the demo acts like the older kind, with neither.
//
// On the emulator, the gateway URL is http://10.0.2.2:8787. Sign in with any
// username and the password "demo".
//
// What a message does depends on its text:
//   - contains "approve": Hermes asks for an Approval before running a command
//     ("approve three" asks for three at once)
//   - contains "ask": Hermes asks a Question with three choices
//   - contains "fail": the turn fails
//   - contains "slow": a long reply, streamed slowly, so Stop can be tried
//   - contains "explore": thinking and tool calls in turns, a dozen steps
//     before the reply, as when Hermes looks through a project
//   - contains "chart" or "image": a reply that delivers files with MEDIA:
//     directives: two pictures, a PDF and a sound named in a sentence, a
//     missing picture and one the phone can't draw. The "Garden water chart"
//     session holds the same reply, saved.
//   - anything else: a reply with Markdown, a code block and one tool call
//
// Keys typed into the terminal (or POST /demo/<key>):
//   d  drop every WebSocket, as a network drop would
//   r  restart: a new replay epoch, so the app must reload what it shows
//   l  start a turn on the "laptop" session, as if another device did
//   a  start a turn on the "Weekly report" session that waits on an Approval
//      (a session the phone hasn't opened, for the other-session alerts)
//   t  time out every waiting Approval
//   e  end every sign-in, as a gateway restart without a fixed signing secret
//      does, and drop every WebSocket
//   m  refill the pending memories shown on Memory review
//   q  quit
//
// `/memory` through command.dispatch answers with the same text as hermes-agent
// v0.22.5, from a few made-up pending memories. Approve and reject remove them.
//
// PATCH /api/sessions/<id> renames, pins and archives a session, and DELETE deletes it,
// after GET /api/sessions/<id>/mutation-snapshot, as the desktop does.
//
// prompt.submit with `confirm_truncate` and `truncate_before_row_id` drops that
// user row and everything after it before the turn runs, as Retry does.
// session.history lists the saved rows with their row ids.
//
// image.attach_bytes and file.attach take uploads; the next reply starts by
// naming what arrived.

import { randomBytes } from 'node:crypto'
import http from 'node:http'
import { deflateSync } from 'node:zlib'
import { parseArgs } from 'node:util'

import { WebSocketServer } from 'ws'

const { values: options } = parseArgs({ options: { port: { type: 'string', default: '8787' }, detach: { type: 'boolean', default: false } } })
const PORT = Number(options.port)
const VERSION = '0.22.4'
const PASSWORD = 'demo'

const now = () => Date.now() / 1000
const id = (prefix = '') => `${prefix}${randomBytes(6).toString('hex')}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let replayEpoch = id('epoch-')
const signedOutCookies = new Set()
// Sign-ins made before this time are refused (key e), as after a gateway restart without a fixed signing secret.
let signInsValidFrom = 0

// ---------------------------------------------------------------- saved data

const sessions = new Map()
const transcripts = new Map()
let nextRowId = 1

let nextSessionNumber = 1

function addSession({ title, preview, ageMinutes, source = 'gui', hidden = false, messages = [] }) {
  // Numbered, so the made-up sessions keep their ids when the script restarts.
  const sessionId = `s-${nextSessionNumber++}`
  const startedAt = now() - ageMinutes * 60 - 600
  const lastActive = now() - ageMinutes * 60

  sessions.set(sessionId, {
    id: sessionId,
    title,
    preview,
    started_at: startedAt,
    last_active: lastActive,
    message_count: messages.length,
    source,
    is_active: false,
    pinned: false,
    hidden,
    archived: false,
    model: 'demo-model',
    ended_at: null,
    input_tokens: 0,
    output_tokens: 0,
    tool_call_count: 0
  })
  transcripts.set(
    sessionId,
    messages.map(([role, text], index) => ({
      id: nextRowId++,
      role,
      content: text,
      timestamp: startedAt + index * 30
    }))
  )

  return sessionId
}

// ------------------------------------------------------------ delivered files

/** A PNG from a function that colours each pixel, so the demo needs no image files. */
function makePng(width, height, pixel) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }

    return c >>> 0
  })
  const crc = bytes => {
    let c = 0xffffffff

    for (const byte of bytes) {
      c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    }

    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))

    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 2 // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const at = y * (width * 3 + 1) + 1 + x * 3
      rows[at] = r
      rows[at + 1] = g
      rows[at + 2] = b
    }
  }

  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])

  return `data:image/png;base64,${png.toString('base64')}`
}

/** Litres per week for six beds, as a bar chart. */
const BED_WATER = [18, 22, 34, 31, 20, 15]
const bedWaterChart = makePng(480, 300, (x, y) => {
  const bar = Math.floor((x - 30) / 72)
  const inBar = x >= 30 && bar < 6 && (x - 30) % 72 >= 12 && (x - 30) % 72 < 60
  const top = 270 - BED_WATER[bar] * 7

  if (y === 270 || (x === 30 && y <= 270)) {
    return [90, 90, 90]
  }

  if (inBar && y < 270 && y >= top) {
    return bar === 2 || bar === 3 ? [214, 120, 40] : [60, 130, 200]
  }

  return y % 40 === 30 && y < 270 ? [232, 236, 240] : [250, 250, 250]
})

/** Six beds seen from above, on grass. */
const gardenPlan = makePng(360, 240, (x, y) => {
  const column = Math.floor((x - 20) / 110)
  const row = Math.floor((y - 20) / 110)
  const inBed = x >= 20 && y >= 20 && column < 3 && row < 2 && (x - 20) % 110 < 95 && (y - 20) % 110 < 95

  if (inBed) {
    return (x + y) % 12 < 2 ? [70, 120, 50] : [120, 84, 52]
  }

  return [126 + ((x * 7 + y * 3) % 20), 176, 96]
})

/** Files the gateway can read, by path. The photo the reply names is missing on purpose. */
const deliveredFiles = new Map([
  ['/opt/data/image_cache/bed-water.png', bedWaterChart],
  ['/opt/data/image_cache/garden-plan.png', gardenPlan],
  // Not a real PNG: the phone can't draw it.
  ['/opt/data/image_cache/broken.png', 'data:image/png;base64,AAAAAAAA']
])

const MEDIA_REPLY = [
  'Here is the water each bed needs per week:',
  'MEDIA:/opt/data/image_cache/bed-water.png',
  'Beds 3 and 4 get the most sun, so they need the most water.',
  '',
  'The full plan is in MEDIA:/opt/data/reports/irrigation plan.pdf, with a spoken summary in MEDIA:/opt/data/audio/summary.mp3.',
  '',
  '| Layout | File |',
  '| --- | --- |',
  '| Six beds | MEDIA:/opt/data/image_cache/garden-plan.png |',
  '',
  "Last year's photo is gone:",
  'MEDIA:/opt/data/image_cache/old-photo.png',
  '',
  "And this one isn't a picture the phone can draw:",
  'MEDIA:/opt/data/image_cache/broken.png'
].join('\n')

const longChat = []

for (let i = 1; i <= 70; i++) {
  longChat.push(['user', `Step ${i}: what should I check next?`])
  longChat.push(['assistant', `For step ${i}, check the logs for **service ${i}** and compare them with the last run.`])
}

addSession({
  title: 'Fix the Docker build cache',
  preview: 'The Docker build re-downloads every layer after I change one file.',
  ageMinutes: 4,
  messages: [
    ['user', 'The Docker build re-downloads every layer after I change one file.'],
    [
      'assistant',
      'Copy the package files first and install, then copy the rest. Then a source change only rebuilds the last layer:\n\n```dockerfile\nCOPY package.json package-lock.json ./\nRUN npm ci\nCOPY . .\n```'
    ]
  ]
})
const laptopSessionId = addSession({
  title: 'Plan the garden irrigation',
  preview: 'Started on the laptop. How many drip lines do I need for six beds?',
  ageMinutes: 35,
  messages: [['user', 'How many drip lines do I need for six beds?']]
})
const reportSessionId = addSession({
  title: 'Weekly report summary',
  preview: 'Summarise the three reports in the inbox folder.',
  ageMinutes: 60 * 5,
  messages: [
    ['user', 'Summarise the three reports in the inbox folder.'],
    ['assistant', 'All three say the release is on track. The second one flags the payment tests as slow.']
  ]
})
addSession({ title: null, preview: 'Can you rename the photos by the date they were taken?', ageMinutes: 60 * 26, messages: [['user', 'Can you rename the photos by the date they were taken?']] })
addSession({ title: 'Long troubleshooting session', preview: 'Step 1: what should I check next?', ageMinutes: 60 * 50, messages: longChat })
addSession({ title: 'Nightly backup check', preview: 'Cron run', ageMinutes: 1, source: 'cron', messages: [['user', 'Check the backups.']] })
addSession({ title: 'Hidden plumbing', preview: 'hidden', ageMinutes: 2, hidden: true })

for (let i = 0; i < 45; i++) {
  addSession({
    title: `Older session ${i + 1}`,
    preview: `Something from ${i + 4} days ago.`,
    ageMinutes: 60 * 24 * (i + 4),
    messages: [['user', `Something from ${i + 4} days ago.`]]
  })
}

// Added last, so the sessions above keep their ids.
addSession({
  title: 'Garden water chart',
  preview: 'Make me a chart of how much water each bed needs.',
  ageMinutes: 8,
  messages: [
    ['user', 'Make me a chart of how much water each bed needs.'],
    ['assistant', MEDIA_REPLY]
  ]
})

// Scheduled job deliveries: no title, and a preview that starts with the
// delivery line, as the real gateway lists them.
for (const [job, message, ageMinutes] of [
  ['USC daily digest', '**USC digest — Sunday**\n- 3 new issues\n- 1 release', 60 * 3],
  ['morning-briefing', '## Morning Brief — Sunday\nRain after 3 pm.', 60 * 9]
]) {
  const text = `[Cron delivery: ${job}] ${message}`

  addSession({ title: null, preview: text, ageMinutes, messages: [['assistant', text]] })
}

// ---------------------------------------------------------------- live sessions

/** runtime id -> { runtimeId, storedId, seq, events, running, status, clients:Set, pending:Map, cancel } */
const live = new Map()

// ------------------------------------------------------------ pending memories

let memoryApproval = true
let pendingMemories = []

function refillPendingMemories() {
  pendingMemories = [
    { id: 'a1b2c3d4', lines: ['add to memory: Prefers short answers in plain English'] },
    {
      id: 'b2c3d4e5',
      lines: ['add to memory: Keeps a running list of release notes in docs/releases.md and wants every new feature added there with the date, a one-l']
    },
    {
      id: 'c3d4e5f6',
      lines: [
        'patch in memory: entry matching: tea',
        "span 'tea' becomes: green tea (rest of the entry is kept)",
        '      patchs entry: User likes tea in the morning'
      ]
    },
    {
      id: 'd4e5f6a7',
      auto: true,
      lines: [
        'background review consolidation (remove on memory): - remove: old project',
        '      removes entry: The old project lives in /srv/old-app and is no longer used'
      ]
    },
    { id: 'e5f6a7b8', lines: ['add to user profile: Works on Hermes UI on weekends'] }
  ]
}

refillPendingMemories()

/** The reply hermes-agent's `/memory` command gives, for the made-up pending memories. */
function memoryCommand(arg) {
  const [sub, target] = arg.trim().split(/\s+/)
  const state = `memory.write_approval = ${memoryApproval ? 'on' : 'off'}`

  if (!sub || sub === 'pending') {
    const list = pendingMemories.length
      ? [
          `Pending memory writes (${pendingMemories.length}):`,
          ...pendingMemories.flatMap(write => [`  ${write.id}${write.auto ? ' [auto]' : ''}  ${write.lines[0]}`, ...write.lines.slice(1)]),
          '',
          'Apply: /memory approve <id>   Reject: /memory reject <id>'
        ].join('\n')
      : 'No pending memory writes.'

    return sub ? list : `${state}\n\n${list}`
  }

  if (sub === 'approval') {
    if (target !== 'on' && target !== 'off') {
      return `${state}\nSet with: /memory approval <on|off>`
    }

    memoryApproval = target === 'on'

    return `memory.write_approval set to '${target}'.`
  }

  if ((sub === 'approve' || sub === 'reject') && target) {
    const chosen = target === 'all' ? pendingMemories : pendingMemories.filter(write => write.id === target)

    if (chosen.length === 0) {
      return target === 'all' ? 'No pending memory writes.' : `No pending memory write with id '${target}'.`
    }

    pendingMemories = pendingMemories.filter(write => !chosen.includes(write))
    console.log(`[demo] ${sub}d pending memories: ${chosen.map(write => write.id).join(', ')}`)

    if (sub === 'reject') {
      return target === 'all' ? `Rejected ${chosen.length} pending memory write(s).` : `Rejected pending memory write '${target}'.`
    }

    const removed = chosen.flatMap(write =>
      write.lines.filter(line => line.startsWith('      removes entry: ')).map(line => `  ${write.id}: ${line.slice(21)}`)
    )

    return [
      `Approved ${chosen.length} memory write(s).`,
      ...(removed.length ? ['Removed entry (re-add anything you still need):', ...removed] : [])
    ].join('\n')
  }

  return 'Unknown /memory subcommand. Use: pending, approve <id>, reject <id>, approval <on|off>.'
}

// The models model.options offers. A session's pick is kept on its live entry.
const MODEL_PROVIDERS = [
  { slug: 'anthropic', name: 'Anthropic', authenticated: true, models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'] },
  { slug: 'openrouter', name: 'OpenRouter', authenticated: true, models: ['openai/gpt-5', 'openai/gpt-5-mini', 'google/gemini-2.5-pro', 'meta/llama-old'], unavailable_models: ['meta/llama-old'] },
  { slug: 'openai', name: 'OpenAI', authenticated: false, models: ['gpt-5'] }
]
const DEFAULT_MODEL = { model: 'claude-sonnet-4-5', provider: 'anthropic' }
const EXPENSIVE_MODELS = new Set(['claude-opus-4-1'])

function liveFor(storedId) {
  for (const entry of live.values()) {
    if (entry.storedId === storedId) {
      return entry
    }
  }

  const entry = { runtimeId: id('rt-'), storedId, seq: 0, events: [], running: false, status: 'idle', clients: new Set(), pending: new Map(), inflight: null, model: { ...DEFAULT_MODEL } }
  live.set(entry.runtimeId, entry)

  return entry
}

function emit(entry, type, payload = {}) {
  const event = { type, session_id: entry.runtimeId, seq: ++entry.seq, payload }
  entry.events.push(event)

  if (entry.events.length > 512) {
    entry.events.shift()
  }

  for (const client of entry.clients) {
    client.sendFrame({ jsonrpc: '2.0', method: 'event', params: event })
  }
}

function broadcast(type, payload = {}) {
  for (const client of clients) {
    client.sendFrame({ jsonrpc: '2.0', method: 'event', params: { type, payload } })
  }
}

/** Sends a server request to every attached client and waits for the first answer. */
function serverRequest(entry, method, params) {
  const requestId = id('req-')
  const full = { session_id: entry.runtimeId, ...params }

  return new Promise(resolve => {
    entry.pending.set(requestId, { id: requestId, method, params: full, resolve })

    for (const client of entry.clients) {
      client.sendFrame({ jsonrpc: '2.0', id: requestId, method, params: full })
    }
  })
}

function settleRequest(entry, requestId, answer) {
  const pending = entry.pending.get(requestId)

  if (pending) {
    entry.pending.delete(requestId)
    pending.resolve(answer)
  }
}

function openRequests(entry) {
  return [...entry.pending.values()].map(({ id: requestId, method, params }) => ({ id: requestId, method, params }))
}

function saveRow(storedId, role, text, extra = {}) {
  const row = { id: nextRowId++, role, content: text, timestamp: now(), ...extra }
  transcripts.get(storedId).push(row)
  const session = sessions.get(storedId)
  session.message_count = transcripts.get(storedId).length
  session.last_active = now()

  if (!session.preview && role === 'user') {
    session.preview = text.slice(0, 80)
  }

  return row
}

async function streamText(entry, text, delayMs) {
  for (const piece of text.match(/.{1,6}/gs) ?? []) {
    if (entry.stopped) {
      return false
    }

    emit(entry, 'message.delta', { text: piece })
    entry.inflight.assistant += piece
    await sleep(delayMs)
  }

  return true
}

const REPLY_INTRO = 'Here is what I found.\n\n'
const REPLY_BODY =
  'The build reads **three** settings:\n\n- `cache_dir`, where layers are kept\n- `max_size`, the limit in GB\n- `keep_days`\n\n| Setting | Default |\n| --- | --- |\n| max_size | 20 |\n| keep_days | 14 |\n\n```python\ndef prune(cache, max_size=20):\n    """Delete the oldest layers until the cache fits."""\n    layers = sorted(cache.layers, key=lambda layer: layer.used_at)\n    while cache.size() > max_size and layers:\n        cache.delete(layers.pop(0))\n```\n\nRun it once a day.'

const README = '/opt/data/project/README.md'

// The "explore" turn: each thought, then the tool calls after it.
const EXPLORE_STEPS = [
  [
    ' The trim is done. Let me check the README headings myself before I report.',
    [
      ['search_files', { pattern: '^#{1,3}', path: README }, '9 matches'],
      ['search_files', { pattern: 'described above|next section', path: README }, 'No matches']
    ]
  ],
  ['Nine headings, and nothing points at a missing section. The README should be about 514 lines.', [['read_file', { path: README }, 'Read 514 lines']]],
  ['"What this is not" is worth keeping: it says what the project leaves out on purpose.', [['read_file', { path: README, offset: 400 }, 'Read 114 lines']]],
  [
    'The Layout section lists every tool. The test comment should point at the audit files now.',
    [
      ['search_files', { pattern: 'play_audit|energy_audit', path: '/opt/data/project/tests' }, '2 matches'],
      ['read_file', { path: '/opt/data/project/tests/test_core.cpp' }, 'Read 80 lines'],
      ['terminal', { command: 'ctest --test-dir build' }, '2 of 2 passed']
    ]
  ],
  ['Everything checks out. Time to report.', []]
]

async function streamReasoning(entry, text) {
  for (const piece of text.match(/.{1,6}/gs) ?? []) {
    if (entry.stopped) {
      return false
    }

    emit(entry, 'reasoning.delta', { text: piece })
    await sleep(35)
  }

  return true
}

async function runTurn(entry, text) {
  const session = sessions.get(entry.storedId)
  saveRow(entry.storedId, 'user', text)
  entry.running = true
  entry.stopped = false
  entry.status = 'working'
  entry.inflight = { user: text, assistant: '', streaming: true }
  emit(entry, 'message.start')

  if (!session.title) {
    session.title = text.slice(0, 40)
    broadcast('sessions.changed')
    emit(entry, 'session.title', { session_id: entry.storedId, title: session.title })
  }

  const lower = text.toLowerCase()
  let finalText = ''
  let status = 'complete'
  let error = null

  try {
    emit(entry, 'reasoning.delta', { text: 'The person wants a short, practical answer. ' })
    await sleep(300)
    emit(entry, 'reasoning.delta', { text: 'I should check the files first.' })

    // "think" gives a long thought that streams for about 15 seconds.
    if (lower.includes('think')) {
      for (let line = 1; line <= 60 && !entry.stopped; line++) {
        emit(entry, 'reasoning.delta', { text: `\n\nStep ${line}: weighing the next thing to check, and what it would rule out.` })
        await sleep(250)
      }
    }

    // Say what was attached, so a client can see its uploads arrived.
    const images = entry.attachedImages ?? []
    const files = [...text.matchAll(/@file:(\S+)/g)].map(match => match[1])
    entry.attachedImages = []

    if (images.length || files.length) {
      const got = [...images.map(name => `the picture ${name}`), ...files.map(name => `the file ${name}`)].join(' and ')
      await streamText(entry, `I got ${got}. `, 30)
    }

    if (lower.includes('fail')) {
      await streamText(entry, 'Let me try that…', 60)
      status = 'error'
      error = 'The model provider answered 500: upstream error.'
      finalText = entry.inflight.assistant
      return
    }

    if (lower.includes('approve')) {
      await streamText(entry, 'I need to delete the old build folder first.', 40)
      emit(entry, 'message.interim', { text: entry.inflight.assistant, already_streamed: true })
      entry.inflight.assistant = ''
      entry.status = 'waiting'

      if (lower.includes('three')) {
        const commands = ['git clean -fdx', 'docker system prune -f', 'rm -rf node_modules/']
        await Promise.all(
          commands.map(command =>
            serverRequest(entry, 'approval', { request_id: id('ap-'), command, description: 'clean up before the build', choices: ['once', 'session', 'always', 'deny'], allow_permanent: true })
          )
        )
      }

      const answer = await serverRequest(entry, 'approval', {
        request_id: id('ap-'),
        command: 'rm -rf build/ && npm run build',
        description: 'delete the build folder and rebuild',
        choices: ['once', 'session', 'always', 'deny'],
        allow_permanent: true,
        smart_denied: false
      })
      entry.status = 'working'
      const choice = answer?.choice ?? 'deny'

      if (choice === 'deny' || answer === 'timeout') {
        await streamText(entry, 'The command was not run, so I stopped there.', 30)
      } else {
        await runTool(entry, 'terminal', { command: 'rm -rf build/ && npm run build' }, 'Build finished in 41 s', 'Removed build/\n> build\nDone in 41.2s')
        await streamText(entry, `Done (${choice}). The build folder was deleted and the build passed.`, 30)
      }

      finalText = entry.inflight.assistant
      return
    }

    if (lower.includes('ask')) {
      entry.status = 'waiting'
      const answer = await serverRequest(entry, 'clarify', {
        questions: [
          { qid: 'q0', question: 'Which branch should I deploy?', choices: ['main (recommended)', 'staging', 'dev'], multi_select: false },
          { qid: 'q1', question: 'Which checks should run first?', choices: ['Unit tests', 'Lint', 'Type check'], multi_select: true },
          { qid: 'q2', question: 'Anything else I should know?', choices: null, multi_select: false }
        ]
      })
      entry.status = 'working'
      const answers = answer?.answers

      await streamText(entry, answers ? `Thanks. I'll use: ${JSON.stringify(answers)}.` : 'No answers, so I left it.', 30)
      finalText = entry.inflight.assistant
      return
    }

    if (lower.includes('explore')) {
      for (const [thought, tools] of EXPLORE_STEPS) {
        if (!(await streamReasoning(entry, thought))) {
          return
        }

        saveRow(entry.storedId, 'assistant', '', { reasoning: thought })

        for (const [name, args, summary] of tools) {
          await runTool(entry, name, args, summary, `${summary}.`)
        }
      }

      await streamText(entry, 'The README has nine sections, and nothing in it points at a section that is gone.', 30)
      finalText = entry.inflight.assistant
      return
    }

    if (lower.includes('chart') || lower.includes('image')) {
      await streamText(entry, MEDIA_REPLY, 30)
      finalText = entry.inflight.assistant
      return
    }

    const slow = lower.includes('slow')
    await streamText(entry, REPLY_INTRO, slow ? 120 : 40)
    emit(entry, 'message.interim', { text: entry.inflight.assistant, already_streamed: true })
    saveRow(entry.storedId, 'assistant', entry.inflight.assistant)
    entry.inflight.assistant = ''
    await runTool(entry, 'read_file', { path: 'build/settings.toml' }, 'Read 12 lines', 'cache_dir = "/var/cache/build"\nmax_size = 20\nkeep_days = 14', '--- a/settings.toml\n+++ b/settings.toml\n@@ -1,2 +1,2 @@\n-max_size = 10\n+max_size = 20')
    const body = slow ? `${REPLY_BODY}\n\n${REPLY_BODY}\n\n${REPLY_BODY}` : REPLY_BODY

    if (!(await streamText(entry, body, slow ? 120 : 25))) {
      status = 'interrupted'
    }

    finalText = entry.inflight.assistant
  } finally {
    if (entry.stopped) {
      status = 'interrupted'
    }

    finalText ||= entry.inflight?.assistant ?? ''

    if (finalText) {
      saveRow(entry.storedId, 'assistant', finalText)
    }

    emit(entry, 'message.complete', { text: finalText, status, error, reasoning: null, usage: null })
    console.log(`turn ended: ${status}`)
    entry.running = false
    entry.status = 'idle'
    entry.inflight = null
    broadcast('sessions.changed')

    const next = entry.queue?.shift()

    if (next) {
      void runTurn(entry, next)
    }
  }
}

async function runTool(entry, name, args, summary, result, diff) {
  const toolId = id('tool-')
  // A real gateway sends this without an id.
  emit(entry, 'tool.generating', { name })
  await sleep(200)
  emit(entry, 'tool.start', { tool_id: toolId, name, args, context: Object.values(args)[0], preview: null })
  await sleep(400)
  emit(entry, 'tool.progress', { tool_id: toolId, name, message: 'working', percent: 50 })
  await sleep(400)
  emit(entry, 'tool.complete', { tool_id: toolId, name, summary, result_text: result, duration_s: 0.8, inline_diff: diff ?? null })
  saveRow(entry.storedId, 'tool', result, { tool_name: name, name, tool_call_id: toolId, args, context: Object.values(args)[0] })
}

// ---------------------------------------------------------------- WebSocket

const clients = new Set()

function handleRpc(client, frame) {
  const { method, params = {} } = frame
  const reply = result => client.sendFrame({ jsonrpc: '2.0', id: frame.id, result })
  const fail = (code, message, data) => client.sendFrame({ jsonrpc: '2.0', id: frame.id, error: { code, message, data } })

  switch (method) {
    case 'client.capabilities':
      return reply({ server_requests: ['approval', 'clarify'], declines_not_shown: true })

    case 'gateway.ping':
      return reply({ ok: true })

    case 'session.active_list':
      return reply({
        sessions: [...live.values()]
          .filter(entry => entry.clients.size > 0 || entry.running)
          .map(entry => ({ id: entry.runtimeId, session_key: entry.storedId, status: entry.status, current: false, title: sessions.get(entry.storedId)?.title ?? '', preview: '', model: 'demo-model', message_count: 0, last_active: now(), started_at: now() }))
      })

    case 'session.create': {
      const storedId = addSession({ title: null, preview: '', ageMinutes: 0 })
      const entry = liveFor(storedId)
      entry.clients.add(client)

      if (params.model && params.provider) {
        entry.model = { model: params.model, provider: params.provider }
      }

      console.log(`session.create ${storedId}: ${entry.model.model} (${entry.model.provider})`)

      return reply({ session_id: entry.runtimeId, stored_session_id: storedId, message_count: 0, messages: [], info: { model: entry.model.model, provider: entry.model.provider } })
    }

    case 'session.resume': {
      const storedId = params.session_id

      if (!sessions.has(storedId)) {
        return fail(4004, 'session not found', { reason: 'not_found' })
      }

      const entry = liveFor(storedId)
      entry.clients.add(client)

      return reply({
        session_id: entry.runtimeId,
        stored_session_id: storedId,
        message_count: transcripts.get(storedId).length,
        messages: params.omit_messages ? [] : transcripts.get(storedId).map(row => ({ role: row.role, text: row.content, timestamp: row.timestamp, row_id: row.id })),
        messages_omitted: Boolean(params.omit_messages),
        info: { model: entry.model.model, provider: entry.model.provider, title: sessions.get(storedId).title },
        running: entry.running,
        inflight: entry.inflight,
        open_requests: openRequests(entry),
        ...(options.detach ? { subscription_id: `sub-${client.id}-${entry.runtimeId}` } : {})
      })
    }

    case 'session.detach': {
      const entry = live.get(params.session_id)

      if (!options.detach) {
        return fail(-32601, 'method not found: session.detach')
      }

      const detached = Boolean(entry?.clients.delete(client))
      console.log(`session.detach ${params.session_id} (${params.subscription_id}): ${detached ? 'detached' : 'not attached'}`)

      return reply({ session_id: params.session_id, subscription_id: params.subscription_id, detached })
    }

    case 'session.close':
      console.log(`session.close ${params.session_id}`)

      return reply({ closed: true, messages: [] })

    case 'prompt.submit': {
      const entry = live.get(params.session_id)

      if (!entry) {
        return fail(4004, 'session not found', { reason: 'not_found' })
      }

      const cutAt = params.truncate_before_row_id

      if (cutAt != null) {
        if (!params.confirm_truncate) {
          return fail(4004, 'truncation needs confirm_truncate')
        }

        if (entry.running) {
          return fail(4009, 'session busy')
        }

        const rows = transcripts.get(entry.storedId)
        const index = rows.findIndex(row => row.id === cutAt && row.role === 'user')

        if (index < 0) {
          return fail(4004, 'truncation target not found')
        }

        if (index === 0 && !params.confirm_empty_truncate) {
          return fail(4004, 'truncating to an empty transcript needs confirm_empty_truncate')
        }

        console.log(`truncated ${rows.length - index} rows before row ${cutAt}`)
        rows.splice(index)
        sessions.get(entry.storedId).message_count = rows.length
        void runTurn(entry, String(params.text ?? ''))

        return reply({ status: 'streaming', survivor_user_row_ids: rows.filter(row => row.role === 'user').map(row => row.id) })
      }

      if (entry.running) {
        entry.queue ??= []
        entry.queue.push(String(params.text ?? ''))

        return reply({ status: 'queued' })
      }

      void runTurn(entry, String(params.text ?? ''))

      return reply({ status: 'streaming' })
    }

    case 'image.attach_bytes': {
      const entry = live.get(params.session_id)
      const base64 = String(params.content_base64 ?? params.data ?? '')

      if (!entry || !base64) {
        return fail(4004, entry ? 'no image bytes' : 'session not found', entry ? undefined : { reason: 'not_found' })
      }

      const name = String(params.filename ?? 'image.png')
      entry.attachedImages = [...(entry.attachedImages ?? []), name]
      console.log(`image.attach_bytes ${name}: ${Math.round((base64.length * 3) / 4 / 1024)} KB`)

      return reply({ attached: true, name, path: `/tmp/hermes-images/${name}`, count: entry.attachedImages.length })
    }

    case 'file.attach': {
      const entry = live.get(params.session_id)
      const dataUrl = String(params.data_url ?? '')

      if (!entry || !dataUrl.startsWith('data:')) {
        return fail(4004, entry ? 'no file bytes' : 'session not found', entry ? undefined : { reason: 'not_found' })
      }

      const name = String(params.name ?? 'file')
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      console.log(`file.attach ${name}: ${Math.round((base64.length * 3) / 4 / 1024)} KB`)

      return reply({ attached: true, name, path: `/work/uploads/${name}`, ref_path: `uploads/${name}`, ref_text: `@file:uploads/${name}`, uploaded: true })
    }

    case 'model.options': {
      const entry = params.session_id ? live.get(params.session_id) : null
      const current = entry?.model ?? DEFAULT_MODEL

      return reply({ providers: MODEL_PROVIDERS, ...current })
    }

    case 'config.set': {
      if (params.key !== 'model') {
        return reply({ ok: true })
      }

      const entry = live.get(params.session_id)

      if (!entry) {
        return fail(4004, 'session not found', { reason: 'not_found' })
      }

      // "<model> --provider <provider> [--session]", as the desktop sends it.
      const [model, ...flags] = String(params.value ?? '').trim().split(/\s+/)
      const provider = flags[flags.indexOf('--provider') + 1] ?? entry.model.provider

      if (EXPENSIVE_MODELS.has(model) && !params.confirm_expensive_model) {
        return reply({ confirm_required: true, confirm_message: `${model} costs about five times as much per message. Switch anyway?` })
      }

      entry.model = { model, provider }
      console.log(`config.set model ${entry.storedId}: ${model} (${provider})${entry.running ? ', from the next turn' : ''}`)
      emit(entry, 'session.info', { model, provider })

      return reply({ ok: true, value: model, ...(entry.running ? { deferred: true } : {}) })
    }

    case 'session.history': {
      const entry = live.get(params.session_id)

      if (!entry) {
        return fail(4004, 'session not found', { reason: 'not_found' })
      }

      const messages = transcripts.get(entry.storedId).map(row => ({ role: row.role, text: row.content, timestamp: row.timestamp, row_id: row.id }))

      return reply({ count: messages.length, messages })
    }

    case 'session.interrupt': {
      const entry = live.get(params.session_id)

      if (!entry?.running) {
        return reply({ status: 'not_interrupted' })
      }

      entry.stopped = true

      for (const pending of entry.pending.values()) {
        pending.resolve({ choice: 'deny' })
      }

      entry.pending.clear()

      return reply({ status: 'interrupted' })
    }

    case 'session.events.since': {
      const entry = live.get(params.session_id)

      if (!entry) {
        return fail(4004, 'session not found', { reason: 'not_found' })
      }

      entry.clients.add(client)
      const events = entry.events.filter(event => event.seq > (params.last_seen ?? 0))

      return reply({ events, latest_seq: entry.seq, truncated: false, count: events.length, epoch: replayEpoch, open_requests: openRequests(entry) })
    }

    case 'approval.respond': {
      const entry = live.get(params.session_id)
      let resolved = 0

      for (const pending of [...(entry?.pending.values() ?? [])]) {
        if (pending.method === 'approval' && (params.all || pending.params.request_id === params.request_id)) {
          settleRequest(entry, pending.id, { choice: params.choice })
          resolved++
        }
      }

      return reply({ resolved })
    }

    case 'approval.pending': {
      const entry = live.get(params.session_id)

      return reply({ approvals: [...(entry?.pending.values() ?? [])].filter(p => p.method === 'approval').map(p => p.params) })
    }

    case 'command.dispatch': {
      if (params.name !== 'memory') {
        return fail(4018, `not a quick/plugin/bundle/skill command: ${params.name}`)
      }

      return reply({ type: 'exec', output: memoryCommand(params.arg ?? '') })
    }

    default:
      return fail(-32601, `unknown method ${method}`)
  }
}

function handleAnswer(frame) {
  console.log(`answer ${frame.id}: ${JSON.stringify(frame.result ?? frame.error)}`)

  for (const entry of live.values()) {
    if (entry.pending.has(frame.id)) {
      // A "not shown here" decline doesn't settle the request.
      if (frame.error?.code === 4404) {
        return
      }

      settleRequest(entry, frame.id, frame.result ?? null)
    }
  }
}

// ---------------------------------------------------------------- HTTP

function cookieValue(req) {
  const match = /hermes_session_at=([^;]+)/.exec(req.headers.cookie ?? '')

  return match?.[1] ?? null
}

// Any session cookie this script gave out counts, even from before a restart,
// unless it was signed out. That keeps the app signed in across restarts.
const signedIn = req => {
  const token = cookieValue(req)

  return Boolean(token?.startsWith('at-')) && !signedOutCookies.has(token) && Number(token.split('-')[1]) >= signInsValidFrom
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

async function readBody(req) {
  let text = ''

  for await (const chunk of req) {
    text += chunk
  }

  return text ? JSON.parse(text) : {}
}

function listRows(query) {
  const exclude = (query.get('exclude_sources') ?? '').split(',').filter(Boolean)
  const archived = query.get('archived') ?? 'exclude'

  return [...sessions.values()]
    .filter(row => !exclude.includes(row.source) && (archived === 'include' || Boolean(row.archived) === (archived === 'only')))
    .map(row => ({ ...row, is_active: [...live.values()].some(entry => entry.storedId === row.id && entry.running) }))
    .sort((a, b) => b.last_active - a.last_active)
}

const ticketsIssued = new Set()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const route = `${req.method} ${url.pathname}`
  console.log(route)

  // For scripted runs without a terminal: POST /demo/<key> does the same as the key.
  const demoKey = /^\/demo\/([dlratme])$/.exec(url.pathname)

  if (req.method === 'POST' && demoKey) {
    process.stdin.emit('data', demoKey[1])

    return sendJson(res, 200, { ok: true })
  }

  if (route === 'GET /api/status') {
    return sendJson(res, 200, { version: VERSION, auth_required: true, auth_providers: ['basic'] })
  }

  if (route === 'GET /api/auth/providers') {
    return sendJson(res, 200, { providers: [{ name: 'basic', display_name: 'Password', supports_password: true }] })
  }

  if (route === 'POST /auth/password-login') {
    const body = await readBody(req)

    if (body.password !== PASSWORD) {
      return sendJson(res, 401, { detail: 'Invalid username or password' })
    }

    const token = id(`at-${Date.now()}-`)

    return sendJson(res, 200, { ok: true, next: '/' }, {
      'Set-Cookie': [
        `hermes_session_at=${token}; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax`,
        `hermes_session_rt=${id('rt-')}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`,
        'hermes_session_provider=basic; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax'
      ]
    })
  }

  if (route === 'POST /auth/logout') {
    signedOutCookies.add(cookieValue(req))

    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': ['hermes_session_at=; Max-Age=0; Path=/', 'hermes_session_rt=; Max-Age=0; Path=/', 'hermes_session_provider=; Max-Age=0; Path=/']
    })
  }

  if (!signedIn(req)) {
    return sendJson(res, 401, { detail: 'Not authenticated' })
  }

  if (route === 'GET /api/auth/me') {
    return sendJson(res, 200, { user: { username: 'demo', provider: 'basic' } })
  }

  if (route === 'POST /api/auth/ws-ticket') {
    const ticket = id('ticket-')
    ticketsIssued.add(ticket)

    return sendJson(res, 200, { ticket, ttl_seconds: 30 })
  }

  if (route === 'GET /api/profiles/sessions') {
    const rows = listRows(url.searchParams)
    const limit = Number(url.searchParams.get('limit') ?? 40)
    const offset = Number(url.searchParams.get('offset') ?? 0)

    return sendJson(res, 200, { sessions: rows.slice(offset, offset + limit), total: rows.length, limit, offset })
  }

  if (route === 'GET /api/fs/read-data-url') {
    // Slow enough to see the spinner frame.
    await sleep(1200)
    const dataUrl = deliveredFiles.get(url.searchParams.get('path') ?? '')

    return dataUrl ? sendJson(res, 200, { dataUrl }) : sendJson(res, 404, { detail: 'File not found' })
  }

  if (route === 'GET /api/sessions/search') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const results = [...sessions.values()]
      .filter(row => !row.hidden && (`${row.title ?? ''} ${row.preview ?? ''}`.toLowerCase().includes(q) || transcripts.get(row.id).some(m => m.content.toLowerCase().includes(q))))
      .map(row => ({ session_id: row.id, title: row.title, snippet: row.preview, last_active: row.last_active, session_started: row.started_at, source: row.source, model: null, role: 'user' }))

    return sendJson(res, 200, { results })
  }

  const messages = /^\/api\/sessions\/([^/]+)\/messages$/.exec(url.pathname)

  if (req.method === 'GET' && messages) {
    const rows = transcripts.get(decodeURIComponent(messages[1]))

    if (!rows) {
      return sendJson(res, 404, { detail: 'not found' })
    }

    const limit = Number(url.searchParams.get('limit') ?? rows.length)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const end = rows.length - offset
    const page = rows.slice(Math.max(0, end - limit), Math.max(0, end))

    return sendJson(res, 200, {
      session_id: messages[1],
      messages: page,
      pagination: { limit, offset, order: 'latest', returned: page.length }
    })
  }

  // Renaming, pinning and deleting a session, fenced by its revision as the
  // real gateway does: read the snapshot, then send its revision back.
  const snapshot = /^\/api\/sessions\/([^/]+)\/mutation-snapshot$/.exec(url.pathname)

  if (req.method === 'GET' && snapshot) {
    const session = sessions.get(decodeURIComponent(snapshot[1]))

    return sendJson(res, 200, { session_id: snapshot[1], exists: Boolean(session), runtime_revision: session?.revision ?? 0, runtime_generation: session ? 0 : null })
  }

  const edited = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)

  if ((req.method === 'PATCH' || req.method === 'DELETE') && edited) {
    const storedId = decodeURIComponent(edited[1])
    const session = sessions.get(storedId)
    const body = req.method === 'PATCH' ? await readBody(req) : Object.fromEntries(url.searchParams)

    if (!session) {
      return sendJson(res, 404, { detail: 'not_found' })
    }

    if (body.expected_revision !== undefined && Number(body.expected_revision) !== (session.revision ?? 0)) {
      return sendJson(res, 409, { detail: 'revision_conflict' })
    }

    if (req.method === 'DELETE') {
      sessions.delete(storedId)
      transcripts.delete(storedId)

      for (const [runtimeId, entry] of live) {
        if (entry.storedId === storedId) {
          live.delete(runtimeId)
        }
      }

      console.log(`deleted ${storedId}`)
      broadcast('sessions.changed')

      return sendJson(res, 200, { ok: true })
    }

    if (typeof body.title === 'string') {
      session.title = body.title.trim() || null
    }

    if (typeof body.pinned === 'boolean') {
      session.pinned = body.pinned
    }

    if (typeof body.archived === 'boolean') {
      session.archived = body.archived
    }

    session.revision = (session.revision ?? 0) + 1
    console.log(`edited ${storedId}: ${JSON.stringify({ title: session.title, pinned: session.pinned, archived: session.archived })}`)
    broadcast('sessions.changed')

    return sendJson(res, 200, { ok: true, title: session.title })
  }

  sendJson(res, 404, { detail: `no route for ${route}` })
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const ticket = new URL(req.url, 'http://x').searchParams.get('ticket')

  wss.handleUpgrade(req, socket, head, ws => {
    if (!ticketsIssued.delete(ticket)) {
      ws.close(4401, 'bad ticket')

      return
    }

    console.log('WebSocket connected')
    const client = { id: id('c-'), ws, sendFrame: frame => ws.readyState === ws.OPEN && ws.send(JSON.stringify(frame)) }
    clients.add(client)
    client.sendFrame({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready', payload: { skin: {}, change_events: true, heartbeat: true, replay_epoch: replayEpoch } } })

    ws.on('message', data => {
      const frame = JSON.parse(String(data))

      if (frame.method && frame.id !== undefined) {
        if (frame.method !== 'gateway.ping') {
          console.log(`rpc ${frame.method}`)
        }

        handleRpc(client, frame)
      } else if (frame.id !== undefined) {
        handleAnswer(frame)
      }
    })

    ws.on('close', () => {
      clients.delete(client)

      for (const entry of live.values()) {
        entry.clients.delete(client)
      }
    })
  })
})

server.listen(PORT, () => console.log(`Demo gateway on http://localhost:${PORT} (emulator: http://10.0.2.2:${PORT}). Password: ${PASSWORD}`))

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}

process.stdin.on('data', key => {
  switch (String(key)) {
    case 'd':
      console.log('Dropping every WebSocket.')
      for (const client of clients) client.ws.terminate()
      break
    case 'r':
      console.log('Restarting: new replay epoch, live sessions dropped.')
      replayEpoch = id('epoch-')
      live.clear()
      for (const client of clients) client.ws.terminate()
      break
    case 'l': {
      console.log('Starting a turn on the laptop session.')
      const entry = liveFor(laptopSessionId)
      void runTurn(entry, 'Make it slow, please: list the parts I need.')
      break
    }
    case 't':
      console.log('Timing out every waiting Approval.')
      for (const entry of live.values()) {
        for (const pending of [...entry.pending.values()].filter(p => p.method === 'approval')) {
          emit(entry, 'request.cancel', { id: pending.id, method: 'approval', reason: 'timeout' })
          settleRequest(entry, pending.id, 'timeout')
        }
      }
      break
    case 'a':
      console.log('Starting a turn that waits on an Approval.')
      void runTurn(liveFor(reportSessionId), 'Please approve the cleanup.')
      break
    case 'e':
      console.log('Ending every sign-in and dropping every WebSocket.')
      signInsValidFrom = Date.now()
      for (const client of clients) client.ws.terminate()
      break
    case 'm':
      console.log('Refilling the pending memories.')
      refillPendingMemories()
      break
    case 'q':
    case '\u0003':
      process.exit(0)
  }
})

