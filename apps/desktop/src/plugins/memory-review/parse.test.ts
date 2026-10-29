// Sample replies follow the format strings in hermes-agent's
// hermes_cli/write_approval_commands.py and tools/memory_tool.py (v0.22.5).

import { describe, expect, it } from 'vitest'

import { parseApprovalReply, parseMemoryReview, replyFailed } from './parse'

const FOOTER = '\nApply: /memory approve <id>   Reject: /memory reject <id>'

describe('parseMemoryReview', () => {
  it('reads the approval setting and an empty list', () => {
    expect(parseMemoryReview('memory.write_approval = off\n\nNo pending memory writes.')).toEqual({
      approvalOn: false,
      writes: []
    })
  })

  it('reads a list without the approval line', () => {
    expect(parseMemoryReview('No pending memory writes.')).toEqual({ approvalOn: null, writes: [] })
  })

  it('reads a single add', () => {
    const text = [
      'memory.write_approval = on',
      '',
      'Pending memory writes (1):',
      '  a1b2c3d4  add to memory: Prefers short answers',
      FOOTER
    ].join('\n')

    expect(parseMemoryReview(text)).toEqual({
      approvalOn: true,
      writes: [
        {
          action: 'add',
          background: false,
          detail: 'Prefers short answers',
          entries: [],
          id: 'a1b2c3d4',
          maybeCut: false,
          summary: 'add to memory: Prefers short answers',
          target: 'memory'
        }
      ]
    })
  })

  it('reads the user profile target', () => {
    const text = ['Pending memory writes (1):', '  0f0f0f0f  add to user profile: Lives in Toronto', FOOTER].join('\n')
    const [write] = parseMemoryReview(text)!.writes

    expect(write.target).toBe('user')
    expect(write.detail).toBe('Lives in Toronto')
  })

  it('marks a detail cut at 120 characters', () => {
    const detail = 'x'.repeat(120)
    const text = ['Pending memory writes (1):', `  0a0a0a0a  add to memory: ${detail}`, FOOTER].join('\n')

    expect(parseMemoryReview(text)!.writes[0].maybeCut).toBe(true)
  })

  it('keeps a summary that runs over several lines', () => {
    const text = [
      'Pending memory writes (1):',
      '  1234abcd  patch in memory: entry matching: likes tea',
      "span 'likes tea' becomes: likes green tea (rest of the entry is kept)",
      '      patchs entry: User likes tea in the morning',
      FOOTER
    ].join('\n')

    const [write] = parseMemoryReview(text)!.writes

    expect(write.action).toBe('patch')
    expect(write.detail).toBe(
      "entry matching: likes tea\nspan 'likes tea' becomes: likes green tea (rest of the entry is kept)"
    )
    expect(write.entries).toEqual([{ action: 'patch', text: 'User likes tea in the morning' }])
  })

  it('reads a background review write with the entry it removes', () => {
    const text = [
      'Pending memory writes (1):',
      '  deadbeef [auto]  background review consolidation (remove on memory): - remove: old fact',
      '      removes entry: The old fact, in full',
      FOOTER
    ].join('\n')

    expect(parseMemoryReview(text)!.writes[0]).toEqual({
      action: 'remove',
      background: true,
      detail: '- remove: old fact',
      entries: [{ action: 'remove', text: 'The old fact, in full' }],
      id: 'deadbeef',
      maybeCut: false,
      summary: 'background review consolidation (remove on memory): - remove: old fact',
      target: 'memory'
    })
  })

  it('marks a background summary cut at 200 characters', () => {
    const head = 'background review consolidation (remove on user): - remove: '
    const summary = head + 'y'.repeat(200 - head.length)
    const text = ['Pending memory writes (1):', `  deadbeef [auto]  ${summary}`, FOOTER].join('\n')
    const [write] = parseMemoryReview(text)!.writes

    expect(write.target).toBe('user')
    expect(write.maybeCut).toBe(true)
  })

  it('reads a batch with several entries', () => {
    const text = [
      'Pending memory writes (1):',
      '  cafe0001  apply 3 op(s) to memory: - add: new fact',
      '- remove: stale',
      "- patch span 'a' -> 'b' (rest of the entry is kept)",
      '      removes entry: A stale entry',
      '      patchs entry: An entry with a in it',
      FOOTER
    ].join('\n')

    const [write] = parseMemoryReview(text)!.writes

    expect(write.action).toBe('batch')
    expect(write.detail).toBe("- add: new fact\n- remove: stale\n- patch span 'a' -> 'b' (rest of the entry is kept)")
    expect(write.entries).toEqual([
      { action: 'remove', text: 'A stale entry' },
      { action: 'patch', text: 'An entry with a in it' }
    ])
  })

  it('keeps an entry that runs over several lines', () => {
    const text = [
      'Pending memory writes (1):',
      '  cafe0002  remove from memory: first line',
      '      removes entry: first line',
      'second line',
      FOOTER
    ].join('\n')

    expect(parseMemoryReview(text)!.writes[0].entries).toEqual([{ action: 'remove', text: 'first line\nsecond line' }])
  })

  it('reads a legacy write with no pinned entry', () => {
    const text = [
      'Pending memory writes (1):',
      '  cafe0003  replace in memory: entry matching: x',
      'whole entry becomes: y',
      '      replace: unpinned legacy target — reject and recreate before approving',
      FOOTER
    ].join('\n')

    const [write] = parseMemoryReview(text)!.writes

    expect(write.action).toBe('replace')
    expect(write.entries).toEqual([{ action: 'replace', text: null }])
  })

  it('reads several writes in order', () => {
    const text = [
      'Pending memory writes (2):',
      '  00000001  add to memory: one',
      '  00000002 [auto]  add to memory: two',
      FOOTER
    ].join('\n')

    expect(parseMemoryReview(text)!.writes.map(write => [write.id, write.background])).toEqual([
      ['00000001', false],
      ['00000002', true]
    ])
  })

  it('reads a summary it does not recognise as is', () => {
    const text = ['Pending memory writes (1):', '  00000003  something new', FOOTER].join('\n')

    expect(parseMemoryReview(text)!.writes[0]).toMatchObject({
      action: 'unknown',
      detail: 'something new',
      target: null
    })
  })

  it('ignores colour codes and Windows line endings', () => {
    const text = '\x1b[1mmemory.write_approval = on\x1b[0m\r\n\r\nNo pending memory writes.\r\n'

    expect(parseMemoryReview(text)).toEqual({ approvalOn: true, writes: [] })
  })

  it('returns null for a reply it does not recognise', () => {
    expect(parseMemoryReview('Unknown /memory subcommand. Use: pending, approve <id>')).toBeNull()
    expect(parseMemoryReview('')).toBeNull()
  })
})

describe('parseApprovalReply', () => {
  it('reads the new setting', () => {
    expect(parseApprovalReply("memory.write_approval set to 'on'.")).toBe(true)
    expect(parseApprovalReply("memory.write_approval set to 'off'.")).toBe(false)
  })

  it('returns null when the setting did not change', () => {
    expect(parseApprovalReply('Failed to set memory.write_approval: disk full')).toBeNull()
  })
})

describe('replyFailed', () => {
  it('accepts replies that worked', () => {
    expect(replyFailed('Approved 1 memory write(s).')).toBe(false)
    expect(replyFailed("Rejected pending memory write 'a1b2c3d4'.")).toBe(false)
    expect(replyFailed('Rejected 3 pending memory write(s).')).toBe(false)
    expect(
      replyFailed('Approved 1 memory write(s).\nRemoved entry (re-add anything you still need):\n  a1b2c3d4: old')
    ).toBe(false)
  })

  it('flags replies that did not work', () => {
    expect(replyFailed('Approved 0 memory write(s).\nFailed:\n  a1b2c3d4: memory store unavailable')).toBe(true)
    expect(replyFailed("No pending memory write with id 'a1b2c3d4'.")).toBe(true)
    expect(replyFailed("Usage: /memory approve|reject <id>  (or 'all')")).toBe(true)
    expect(replyFailed('Failed to set memory.write_approval: disk full')).toBe(true)
    expect(replyFailed('')).toBe(true)
  })
})
