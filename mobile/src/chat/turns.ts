import type { DisplayItem } from './activity'

/**
 * Where each finished turn ends: its last reply's key, with all the turn's
 * reply text, for Copy. Tool calls and thinking are left out. A turn still
 * running has no end yet.
 */
export function turnEnds(items: DisplayItem[], running: boolean): Map<string, string> {
  const ends = new Map<string, string>()
  let lastReply: string | null = null
  let texts: string[] = []

  const close = () => {
    if (lastReply) {
      ends.set(lastReply, texts.join('\n\n'))
    }

    lastReply = null
    texts = []
  }

  for (const item of items) {
    if (item.kind === 'user') {
      close()
    } else if (item.kind === 'assistant') {
      lastReply = item.key

      if (item.text.trim()) {
        texts.push(item.text.trim())
      }
    }
  }

  if (!running) {
    close()
  }

  return ends
}
