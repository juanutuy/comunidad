export const BRAND_PRESETS = ['#2563eb', '#7c3aed', '#0f766e', '#be185d', '#b45309'] as const

/** Validated CSS only: tenant input must never become arbitrary stylesheet text. */
export function brandStyles(input: unknown): string {
  const hex = typeof input === 'string' && /^#[\da-f]{6}$/i.test(input) ? input : '#2563eb'
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const mix = (target: number, weight: number) => rgb.map(v => Math.round(v + (target - v) * weight))
  const css = (values: number[]) => `#${values.map(v => v.toString(16).padStart(2, '0')).join('')}`
  const luminance = (values: number[]) => values.map(v => {
    const s = v / 255
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4
  }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0)
  function accessible(dark: boolean) {
    for (let step = 0; step <= 100; step++) {
      const color = mix(dark ? 255 : 0, step / 100)
      const l = luminance(color)
      if ((dark ? (l + .05) / .05 : 1.05 / (l + .05)) >= 4.5) return css(color)
    }
    return dark ? '#ffffff' : '#000000'
  }
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
  const palette = shades.map(s => `--ui-color-primary-${s}:${css(s < 500 ? mix(255, (500 - s) / 500) : mix(0, (s - 500) / 550))}`).join(';')
  return `:root{${palette};--community-brand:${hex};--ui-primary:${accessible(false)}}html.dark{--ui-primary:${accessible(true)}}`
}
