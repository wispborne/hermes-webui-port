import { mix, parseColor } from '@hermes/shared/color'

const COLOR_MIX_RE = /^color-mix\(\s*in\s+srgb\s*,\s*(#[0-9a-f]{3,6})\s+(\d+(?:\.\d+)?)%\s*,\s*(#[0-9a-f]{3,6}|transparent)\s*\)$/i

/**
 * A palette colour Android can draw. The desktop's palettes are CSS, and a few
 * write a colour as `color-mix(in srgb, A p%, B)`. That becomes the mixed hex,
 * or `rgba()` when B is `transparent`. Anything else is returned unchanged.
 */
export function drawableColor(value: string): string {
  const match = COLOR_MIX_RE.exec(value.trim())

  if (!match) {
    return value
  }

  const [, a, percent, b] = match
  const share = Number(percent) / 100

  if (b!.toLowerCase() === 'transparent') {
    const [r, g, bl] = parseColor(a!)!

    return `rgba(${r}, ${g}, ${bl}, ${share})`
  }

  return mix(b!, a!, share)
}

/** Every colour of a palette, made drawable. */
export function drawablePalette<T extends object>(colors: T): T {
  return Object.fromEntries(
    Object.entries(colors).map(([slot, value]) => [slot, typeof value === 'string' ? drawableColor(value) : value])
  ) as T
}
