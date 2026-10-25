import { drawableColor } from './css-color'

describe('drawableColor', () => {
  it('mixes two colours as CSS color-mix does', () => {
    expect(drawableColor('color-mix(in srgb, #0053FD 10%, #FFFFFF)')).toBe('#e6eeff')
    expect(drawableColor('color-mix(in srgb, #000000 50%, #ffffff)')).toBe('#808080')
  })

  it('mixes with transparent as rgba', () => {
    expect(drawableColor('color-mix(in srgb, #0053FD 20%, transparent)')).toBe('rgba(0, 83, 253, 0.2)')
  })

  it('leaves other colours unchanged', () => {
    expect(drawableColor('#123456')).toBe('#123456')
    expect(drawableColor('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)')
  })
})
