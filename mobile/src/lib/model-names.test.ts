import { displayModelName } from './model-names'

describe('displayModelName', () => {
  it('names models the way the desktop does', () => {
    expect(displayModelName('claude-sonnet-4-5')).toBe('Sonnet 4.5')
    expect(displayModelName('anthropic/claude-opus-4-1-20250805')).toBe('Opus 4.1')
    expect(displayModelName('openai/gpt-5-mini')).toBe('GPT-5-mini')
    expect(displayModelName('google/gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
    expect(displayModelName('deepseek-v3')).toBe('DeepSeek V3')
    expect(displayModelName('qwen3-235b-a22b')).toBe('Qwen3 235B A22B')
  })

  it('keeps variants and the context window as tags', () => {
    expect(displayModelName('claude-opus-4-8-fast')).toBe('Opus 4.8 Fast')
    expect(displayModelName('claude-sonnet-5[1m]')).toBe('Sonnet 5 1M')
  })
})
