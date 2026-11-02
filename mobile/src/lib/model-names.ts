// Short names for model ids, as the desktop shows them: "claude-sonnet-4-5"
// is "Sonnet 4.5". A trimmed copy of apps/desktop/src/lib/model-status-label.ts
// (displayModelName), without the local-model quant tags.

const VARIANT_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/-fast$/i, 'Fast'],
  [/-flash$/i, 'Flash'],
  [/-thinking$/i, 'Thinking'],
  [/-preview$/i, 'Preview'],
  [/-latest$/i, 'Latest']
]

const VENDOR_CASING: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDeepseek\b/g, 'DeepSeek'],
  [/\bGlm\b/g, 'GLM'],
  [/\bMinimax\b/g, 'MiniMax'],
  [/\bOpenai\b/g, 'OpenAI'],
  [/\bAi\b/g, 'AI']
]

const titleCase = (text: string) => text.replace(/\b\w/g, char => char.toUpperCase()).trim()

function vendorCasing(text: string) {
  let cased = text.replace(/\b(a?)(\d+(?:\.\d+)?)b\b/gi, (_match, prefix: string, size: string) => `${prefix.toUpperCase()}${size}B`)

  for (const [pattern, replacement] of VENDOR_CASING) {
    cased = cased.replace(pattern, replacement)
  }

  return cased
}

function prettify(base: string) {
  if (/^claude-/i.test(base)) {
    // "haiku-4-5" is "Haiku 4.5".
    return vendorCasing(titleCase(base.replace(/^claude-/i, '').replace(/(\d)-(?=\d)/g, '$1.').replace(/-/g, ' ')))
  }

  if (/^gpt-/i.test(base)) {
    return base.replace(/^gpt-/i, 'GPT-')
  }

  if (/^gemini-/i.test(base)) {
    return vendorCasing(titleCase(base.replace(/^gemini-/i, 'Gemini ').replace(/-/g, ' ')))
  }

  return vendorCasing(titleCase(base.replace(/-/g, ' ')))
}

/** The model's name for menus and the session header. */
export function displayModelName(model: string): string {
  const trimmed = model.trim()
  let base = trimmed.slice(trimmed.lastIndexOf('/') + 1)
  const tags: string[] = []

  for (const [pattern, label] of VARIANT_TAGS) {
    if (pattern.test(base)) {
      tags.push(label)
      base = base.replace(pattern, '')
      break
    }
  }

  // "[1m]" picks the 1M-token context window.
  const window = base.match(/\[(\d+[mk])\]$/i)

  if (window) {
    tags.push(window[1].toUpperCase())
    base = base.slice(0, -window[0].length)
  }

  // A date pin such as "-20251101" isn't part of the name.
  base = base.replace(/-\d{8}$/, '')

  return [prettify(base) || trimmed, ...tags].join(' ')
}
