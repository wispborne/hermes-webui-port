// Reading MEDIA delivery directives out of message text, the way a bubble
// draws it. Storage keeps the text as it was sent; this is a render concern.

import { type MediaSegment, isInlineMediaSrc, mediaKind, mediaName, parseMediaSegments } from './media'

/** Segments as short strings, so a failure shows what the bubble would draw. */
const draw = (text: string) =>
  parseMediaSegments(text).map((segment: MediaSegment) => (segment.kind === 'text' ? `text:${segment.text}` : `media:${segment.path}`))

/** The prose a reply keeps, with the directives left out. */
const prose = (text: string) =>
  parseMediaSegments(text)
    .filter((segment: MediaSegment) => segment.kind === 'text')
    .map((segment: MediaSegment) => (segment.kind === 'text' ? segment.text : ''))
    .join('')

const mediaPaths = (text: string) =>
  parseMediaSegments(text)
    .filter((segment: MediaSegment) => segment.kind === 'media')
    .map((segment: MediaSegment) => (segment.kind === 'media' ? segment.path : ''))

describe('a directive on its own line', () => {
  it('splits the reply around it and keeps the line breaks', () => {
    expect(draw('Here is the chart:\nMEDIA:/opt/data/image_cache/chart.png\nDone.')).toEqual([
      'text:Here is the chart:\n',
      'media:/opt/data/image_cache/chart.png',
      'text:\nDone.'
    ])
  })

  it('is the whole reply when nothing else is written', () => {
    expect(draw('MEDIA:/tmp/a.png')).toEqual(['media:/tmp/a.png'])
  })

  it('leaves the plain text of a reply with no directive as it is', () => {
    expect(draw('Just an answer, with no file.')).toEqual(['text:Just an answer, with no file.'])
  })

  it('takes each directive on its own line, in order', () => {
    expect(mediaPaths('MEDIA:/tmp/plan.md\nMEDIA:/tmp/plot.png\nMEDIA:/tmp/clip.mp4')).toEqual(['/tmp/plan.md', '/tmp/plot.png', '/tmp/clip.mp4'])
  })

  it('gives up the spaces around it on its own line', () => {
    expect(draw('MEDIA:  /tmp/a.png  ')).toEqual(['media:/tmp/a.png'])
  })
})

describe('a directive inside a sentence', () => {
  it('keeps the words before and after it', () => {
    expect(draw('See MEDIA:/tmp/a.png for details.')).toEqual(['text:See ', 'media:/tmp/a.png', 'text: for details.'])
  })

  it('leaves the period that ends the sentence in the prose', () => {
    expect(draw('Open MEDIA:/tmp/a.pdf.')).toEqual(['text:Open ', 'media:/tmp/a.pdf', 'text:.'])
  })

  it('leaves the punctuation that closes the markdown around it', () => {
    expect(draw('**MEDIA:/tmp/a.png**')).toEqual(['text:**', 'media:/tmp/a.png', 'text:**'])
  })

  it('reads two directives in one sentence and the words between them', () => {
    expect(draw('MEDIA:/tmp/a.png, then MEDIA:/tmp/b.pdf.')).toEqual(['media:/tmp/a.png', 'text:, then ', 'media:/tmp/b.pdf', 'text:.'])
  })

  it('keeps a bracketed note after it out of the path', () => {
    expect(draw('Report at MEDIA:/tmp/my report.pdf (done).')).toEqual(['text:Report at ', 'media:/tmp/my report.pdf', 'text: (done).'])
  })
})

describe('a quoted path', () => {
  it('takes the path inside backticks, quotes or apostrophes, and drops the quotes', () => {
    expect(mediaPaths('MEDIA:`/tmp/my report.pdf`')).toEqual(['/tmp/my report.pdf'])
    expect(mediaPaths('MEDIA:"/tmp/my report.pdf"')).toEqual(['/tmp/my report.pdf'])
    expect(mediaPaths("MEDIA:'/tmp/my report.pdf'")).toEqual(['/tmp/my report.pdf'])
  })

  it('keeps the spaces inside the quotes when the directive sits in a sentence', () => {
    expect(draw('Here it is: MEDIA:`/tmp/my report.pdf`, ready.')).toEqual(['text:Here it is: ', 'media:/tmp/my report.pdf', 'text:, ready.'])
  })
})

describe('a path with spaces in it', () => {
  it('reads it by its delivery extension', () => {
    expect(mediaPaths('MEDIA:/tmp/my report.pdf')).toEqual(['/tmp/my report.pdf'])
    expect(mediaPaths('MEDIA:/tmp/My Final Report (v2).pdf')).toEqual(['/tmp/My Final Report (v2).pdf'])
  })

  it('reads a Windows path', () => {
    expect(mediaPaths('MEDIA:C:\\Users\\david\\Reports\\plot.png')).toEqual(['C:\\Users\\david\\Reports\\plot.png'])
  })
})

describe('a directive that is not complete yet', () => {
  it('leaves a path cut short mid-stream as text', () => {
    expect(draw('MEDIA:/im')).toEqual(['text:MEDIA:/im'])
    expect(draw('MEDIA:/tmp/a.pn')).toEqual(['text:MEDIA:/tmp/a.pn'])
    expect(draw('MEDIA:/tmp/a.pdf.MORE')).toEqual(['text:MEDIA:/tmp/a.pdf.MORE'])
  })

  it('leaves a word that is not a path as text', () => {
    expect(draw('MEDIA:noise')).toEqual(['text:MEDIA:noise'])
    expect(draw('MEDIA:/tmp/dir.name/noext')).toEqual(['text:MEDIA:/tmp/dir.name/noext'])
  })

  it('leaves an unclosed quote as text until the quote closes', () => {
    expect(draw('MEDIA:`/tmp/a.png')).toEqual(['text:MEDIA:`/tmp/a.png'])
  })

  it('reads the same text once the path is complete', () => {
    expect(draw('MEDIA:/tmp/a.png')).toEqual(['media:/tmp/a.png'])
  })

  it('never loses the plain text of a reply', () => {
    const text = 'Working on it.\nMEDIA:/tmp/half\nThen: done.'

    expect(prose(text)).toBe(text)
  })
})

describe('a directive inside code', () => {
  it('stays text inside a fenced code block', () => {
    const text = 'Example:\n```bash\nMEDIA:/tmp/a.png\n```\nAfter.'

    expect(draw(text)).toEqual([`text:${text}`])
  })

  it('stays text in an inline code span', () => {
    const text = 'Write `MEDIA:/tmp/a.png` to deliver a file.'

    expect(draw(text)).toEqual([`text:${text}`])
  })

  it('stays text to the end of an unclosed fence', () => {
    const text = 'Example:\n```bash\nMEDIA:/tmp/a.png'

    expect(draw(text)).toEqual([`text:${text}`])
  })

  it('resolves again in the text after a closed fence', () => {
    expect(draw('```\nMEDIA:/tmp/in.png\n```\nMEDIA:/tmp/out.png')).toEqual([
      'text:```\nMEDIA:/tmp/in.png\n```\n',
      'media:/tmp/out.png'
    ])
  })
})

describe('a directive that carries the bytes or a URL itself', () => {
  it('reads a data: value and knows its kind from the MIME type', () => {
    const path = 'data:image/png;base64,iVBORw0KGg'

    expect(mediaPaths(`MEDIA:${path}`)).toEqual([path])
    expect(isInlineMediaSrc(path)).toBe(true)
    expect(mediaKind(path)).toBe('image')
    expect(mediaKind('data:application/pdf;base64,JVBERi0')).toBe('file')
  })

  it('reads an http or https value', () => {
    const path = 'https://cdn.example.com/img/photo.jpg?size=large'

    expect(mediaPaths(`MEDIA:${path}`)).toEqual([path])
    expect(isInlineMediaSrc(path)).toBe(true)
    expect(mediaKind(path)).toBe('image')
    expect(isInlineMediaSrc('/tmp/a.png')).toBe(false)
  })
})

describe('what kind of deliverable a path is', () => {
  it('by extension', () => {
    expect(mediaKind('/tmp/a.png')).toBe('image')
    expect(mediaKind('/tmp/a.WebP')).toBe('image')
    // `<Image>` on the phone can't decode an SVG: it chips instead of drawing a blank frame.
    expect(mediaKind('/tmp/diagram.svg')).toBe('file')
    expect(mediaKind('data:image/svg+xml;base64,PHN2Zz4=')).toBe('file')
    expect(mediaKind('/tmp/clip.mp4')).toBe('video')
    expect(mediaKind('/tmp/song.opus')).toBe('audio')
    expect(mediaKind('/tmp/my report.pdf')).toBe('file')
    expect(mediaKind('/tmp/notes.txt')).toBe('file')
    expect(mediaKind('/tmp/archive.zip')).toBe('file')
    expect(mediaKind('/tmp/unknown.qqq')).toBe('file')
  })
})

describe('the name to show for a deliverable', () => {
  it('is the last part of the path', () => {
    expect(mediaName('/opt/data/image_cache/chart.png')).toBe('chart.png')
    expect(mediaName('C:\\Users\\david\\Reports\\plot.png')).toBe('plot.png')
    expect(mediaName('https://example.com/img/photo.jpg?size=large')).toBe('photo.jpg')
    expect(mediaName('notes.txt')).toBe('notes.txt')
    expect(mediaName('/tmp/my report.pdf')).toBe('my report.pdf')
  })
})
