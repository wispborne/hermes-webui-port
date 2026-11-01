// MEDIA delivery directives in message text.
//
// Hermes delivers files it made by writing `MEDIA:<path>` into the text of a
// message, both while a Turn streams and in saved transcript rows
// (gateway/platforms/base.py, MEDIA_DELIVERY_EXTS). The text is kept exactly as
// sent: ChatItem.text and the saved transcript carry the directive verbatim.
// This file reads directives at render time only.
//
// The rules follow the desktop's apps/desktop/src/lib/chat-messages/parts.ts,
// simplified for the phone:
// - A directive on its own line, one inline in a sentence, and quoted paths
//   (backticks, double quotes, single quotes) all resolve.
// - An unquoted path may contain spaces. It is recognized by ending with a
//   known delivery extension.
// - Sentence punctuation after an unquoted path stays in the prose.
// - A directive inside an inline code span or a fenced code block stays text.
// - A directive that isn't complete yet (a path cut short mid-stream, or an
//   unclosed quote) stays text until it is.
// Unlike the desktop, an unquoted path with no known delivery extension stays
// text here too. That keeps a half-written path from flashing as a chip
// mid-stream, and a stray word after `MEDIA:` from becoming a dead chip.

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

export type MediaSegment = { kind: 'text'; text: string } | { kind: 'media'; path: string }

/** Mirrors the gateway's `MEDIA_DELIVERY_EXTS` (gateway/platforms/base.py). */
const MEDIA_DELIVERY_EXTS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'tiff',
  'svg',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  '3gp',
  'mp3',
  'm2a',
  'wav',
  'ogg',
  'opus',
  'm4a',
  'flac',
  'pdf',
  'docx',
  'doc',
  'odt',
  'rtf',
  'txt',
  'md',
  'epub',
  'xlsx',
  'xls',
  'ods',
  'csv',
  'tsv',
  'json',
  'xml',
  'yaml',
  'yml',
  'kmz',
  'kml',
  'geojson',
  'gpx',
  'pptx',
  'ppt',
  'odp',
  'key',
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'apk',
  'ipa',
  'html',
  'htm'
] as const

const DELIVERY_EXT_SET = new Set<string>(MEDIA_DELIVERY_EXTS)

// The desktop's mediaKind categories, extended with the gateway's video and
// audio extensions that the desktop's map leaves as 'file'.
const KIND_BY_EXT: Record<string, MediaKind> = {
  avi: 'video',
  bmp: 'image',
  flac: 'audio',
  gif: 'image',
  jpeg: 'image',
  jpg: 'image',
  m4a: 'audio',
  m2a: 'audio',
  mkv: 'video',
  mov: 'video',
  mp3: 'audio',
  mp4: 'video',
  ogg: 'audio',
  opus: 'audio',
  png: 'image',
  // Android's and iOS's `<Image>` can't decode an SVG, data or file: a frame
  // would sit blank on the phone. The desktop renders SVGs; the phone chips them.
  svg: 'file',
  wav: 'audio',
  webm: 'video',
  webp: 'image',
  '3gp': 'video'
}

// Sort longest-first so the alternation never matches a shorter extension as a
// prefix of a longer one.
const EXT_ALTERNATION = [...MEDIA_DELIVERY_EXTS].sort((a, b) => b.length - a.length).join('|')

// The desktop's capture branches, kept as they are there.
const QUOTED_PATH = '`[^`\\n]+`|"[^"\\n]+"|\'[^\'\\n]+\''
const ANCHORED_PATH = `(?:~/|/|[A-Za-z]:[/\\\\])\\S+?(?:[^\\S\\n]+\\S+?)*?\\.(?:${EXT_ALTERNATION})(?=[\\s\`"'*_,;:)\\]}]|MEDIA:|$)`
const BARE_PATH = '[^\\s`"]+'

// One directive, tried at a fixed position (`y`), so the scanner in
// parseMediaSegments decides where a directive starts.
const DIRECTIVE_AT = new RegExp(`[\`"']?MEDIA:\\s*(${QUOTED_PATH}|${ANCHORED_PATH}|${BARE_PATH})[\`"']?`, 'y')

// Sentence punctuation that can trail a bare capture in prose
// (`open MEDIA:/tmp/a.pdf.`). Same as the desktop's.
const TRAILING_PUNCTUATION = '.,;:!?'

/** Whether a capture can name a real deliverable: a path separator, or a dot with file content after it. */
function isPlausibleMediaPath(value: string): boolean {
  return value.includes('/') || value.includes('\\') || /\.[^.]/.test(value)
}

/** A path is complete when it ends with a known delivery extension, or already names the bytes or a URL. */
function isCompleteMediaPath(path: string): boolean {
  if (/^(?:https?|data):/i.test(path)) {
    return true
  }

  const ext = path.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase()

  return ext !== undefined && DELIVERY_EXT_SET.has(ext)
}

/** A `data:`/`http(s):` value carries the bytes or a source URL itself: no gateway read needed. */
export function isInlineMediaSrc(path: string): boolean {
  return /^(?:https?|data):/i.test(path)
}

/** Split a bare capture into its path and the sentence punctuation that trailed it. Same rule as the desktop's. */
function splitTrailingPunctuation(value: string): { path: string; punctuation: string } {
  let end = value.length

  while (end > 0 && TRAILING_PUNCTUATION.includes(value[end - 1] ?? '')) {
    if (!isPlausibleMediaPath(value.slice(0, end - 1))) {
      break
    }

    end -= 1
  }

  return { path: value.slice(0, end), punctuation: value.slice(end) }
}

/**
 * The path a capture names, and the prose punctuation it must give back, or
 * null when the capture is not a complete directive. Quoted captures keep
 * everything inside their quotes; only bare captures shed punctuation.
 */
function mediaPathFromCapture(capture: string): { path: string; punctuation: string } | null {
  const raw = capture.trim()
  const quote = raw[0]
  const quoted = raw.length > 1 && quote !== undefined && quote === raw.at(-1) && (quote === '`' || quote === '"' || quote === "'")

  if (quoted) {
    const path = raw.slice(1, -1)

    return isPlausibleMediaPath(path) ? { path, punctuation: '' } : null
  }

  // A trailing backtick or double quote left in the capture is formatting residue, not part of the path.
  const last = raw.at(-1)
  const value = last === '`' || last === '"' ? raw.slice(0, -1) : raw
  const { path, punctuation } = splitTrailingPunctuation(value)

  if (!isPlausibleMediaPath(path) || !isCompleteMediaPath(path)) {
    return null
  }

  return { path, punctuation }
}

/**
 * Ranges covered by fenced code blocks and inline code spans, where a
 * `MEDIA:` stays text. Fences pair per line; an unclosed fence covers the rest
 * of the text. Inline spans pair equal-length backtick runs on one line, so a
 * quoted directive path (the quote sits after `MEDIA:`) is left for the
 * directive matcher.
 */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const lines = text.split('\n')
  let fence: { char: string; length: number; startLine: number } | null = null
  let offset = 0

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const start = offset

    offset += line.length + 1

    if (fence) {
      const close = new RegExp(`^ {0,3}(?:\\${fence.char}){${fence.length},}[ \\t]*$`)

      if (close.test(line)) {
        ranges.push([startOfLine(lines, fence.startLine), start + line.length])
        fence = null
      }

      continue
    }

    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line)

    if (opener) {
      fence = { char: opener[1] === '~' ? '~' : '`', length: (opener[1] ?? '').length, startLine: index }
      continue
    }

    let i = 0

    while (i < line.length) {
      if (line[i] !== '`') {
        i += 1
        continue
      }

      let end = i
      while (line[end] === '`') end += 1

      const run = end - i
      let closed = false

      for (let j = end; j < line.length; ) {
        if (line[j] !== '`') {
          j += 1
          continue
        }

        let k = j
        while (line[k] === '`') k += 1

        if (k - j === run) {
          ranges.push([start + i, start + k])
          i = k
          closed = true
          break
        }

        j = k
      }

      if (!closed) {
        i = end
      }
    }
  }

  if (fence) {
    ranges.push([startOfLine(lines, fence.startLine), text.length])
  }

  return ranges.sort((a, b) => a[0] - b[0])
}

const startOfLine = (lines: string[], lineIndex: number): number =>
  lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0)

/** Whether a directive could start here: `MEDIA:` itself, or a quote that the directive's optional leading quote would eat. */
function couldStartDirective(text: string, index: number): boolean {
  const char = text[index]

  if (char === 'M') {
    return text.startsWith('MEDIA:', index)
  }

  if (char === '"' || char === "'" || char === '`') {
    return text.startsWith('MEDIA:', index + 1)
  }

  return false
}

/** Whether a match stands alone on its line, in the original text. */
function isStandaloneLine(text: string, matchStart: number, matchEnd: number): boolean {
  let before = matchStart - 1

  while (before >= 0 && (text[before] === ' ' || text[before] === '\t')) {
    before -= 1
  }

  if (before >= 0 && text[before] !== '\n') {
    return false
  }

  let after = matchEnd

  while (after < text.length && (text[after] === ' ' || text[after] === '\t')) {
    after += 1
  }

  return after === text.length || text[after] === '\n'
}

/**
 * Split text into the order a bubble should draw it: prose segments and media
 * paths. Concatenating the text segments and the resolved directives rebuilds
 * the original text, apart from the directive's own quotes and spacing.
 */
export function parseMediaSegments(text: string): MediaSegment[] {
  if (!text.includes('MEDIA:')) {
    return [{ kind: 'text', text }]
  }

  const ranges = codeRanges(text)
  const segments: MediaSegment[] = []
  let pending = ''
  let rangeIndex = 0
  let i = 0

  const flush = () => {
    if (pending) {
      appendSegment(segments, { kind: 'text', text: pending })
      pending = ''
    }
  }

  while (i < text.length) {
    while (rangeIndex < ranges.length && ranges[rangeIndex]![1] <= i) {
      rangeIndex += 1
    }

    const range = ranges[rangeIndex]

    if (range && i >= range[0] && i < range[1]) {
      pending += text.slice(i, range[1])
      i = range[1]
      continue
    }

    if (couldStartDirective(text, i)) {
      DIRECTIVE_AT.lastIndex = i
      const match = DIRECTIVE_AT.exec(text)

      if (match) {
        const found = mediaPathFromCapture(match[1] ?? '')

        if (found) {
          const matchEnd = i + match[0].length
          const standalone = isStandaloneLine(text, i, matchEnd)

          if (standalone) {
            // The desktop's line rule: a directive line gives up its own indentation and trailing spaces, and keeps the line break.
            pending = pending.replace(/[ \t]+$/, '')
          }

          flush()
          appendSegment(segments, { kind: 'media', path: found.path })
          pending = found.punctuation

          if (standalone) {
            while (i + match[0].length < text.length && (text[i + match[0].length] === ' ' || text[i + match[0].length] === '\t')) {
              i += 1
            }
          }

          i += match[0].length
          continue
        }
      }
    }

    pending += text[i]
    i += 1
  }

  flush()

  return segments
}

function appendSegment(segments: MediaSegment[], segment: MediaSegment): void {
  const last = segments[segments.length - 1]

  if (segment.kind === 'text' && last?.kind === 'text') {
    last.text += segment.text

    return
  }

  if (segment.kind === 'media' || segment.text) {
    segments.push(segment)
  }
}

/** What kind of deliverable a path is, by extension (or by MIME for a `data:` value). */
export function mediaKind(path: string): MediaKind {
  const data = /^data:(image|video|audio)\/([^;,]*)/i.exec(path)

  if (data?.[1]) {
    // Same rule as the extension map: a `data:image/svg+xml` value draws a
    // blank frame on the phone, so it is a chip.
    if (data[2]?.toLowerCase() === 'svg+xml' || data[2]?.toLowerCase() === 'svg') {
      return 'file'
    }

    return data[1].toLowerCase() as MediaKind
  }

  const ext = path.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase()

  return (ext && KIND_BY_EXT[ext]) || 'file'
}

/** The file's name: the last path part. Same shape as the desktop's mediaName. */
export function mediaName(path: string): string {
  // `C:\Users\…` parses as a URL with scheme `c:`; a drive letter is a path, not a scheme.
  if (!/^[A-Za-z]:[\\/]/.test(path)) {
    try {
      return new URL(path).pathname.split('/').filter(Boolean).pop() || path
    } catch {
      // Not a URL. Fall through to the path split.
    }
  }

  return path.split(/[\\/]/).filter(Boolean).pop() || path
}
