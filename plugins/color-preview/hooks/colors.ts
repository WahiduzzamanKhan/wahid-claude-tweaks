import type { Formats } from '../types'

// Turns a CSS colour as written into the #rrggbb a terminal can paint. Alpha is
// dropped: the chip shows the colour itself, not how it blends over a background
// the plugin cannot know.

// The CSS named colours (CSS Color Module Level 4), lowercase.
export const NAMED: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff',
  beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff',
  blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9',
  darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
  darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
  lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0',
  lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000',
  mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db',
  mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23',
  orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98',
  paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f',
  pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072',
  sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0',
  skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8',
  tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
}

// rgb(), rgba(), hsl() and hsla() below take commas or spaces and an optional alpha.
// #rrggbb or #rrggbbaa; three- and four-digit forms are left alone so issue
// numbers like #123 stay plain.
const HEX = String.raw`#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-zA-Z_])`

// Every CSS name as a whole word, wherever it is written.
const NAMES = String.raw`\b(?:${Object.keys(NAMED).join('|')})\b`

export const ALL_ON: Formats = { hex: true, rgb: true, hsl: true, named: true }

// One pattern for the formats switched on; null with every one off.
export function patternFor(formats: Formats): RegExp | null {
  const parts = [
    formats.hex && HEX,
    formats.rgb && String.raw`\brgba?\(\s*[-+.\d%a-z\s,/]*?\)`,
    formats.hsl && String.raw`\bhsla?\(\s*[-+.\d%a-z\s,/]*?\)`,
    formats.named && NAMES,
  ].filter(Boolean)
  return parts.length === 0 ? null : new RegExp(parts.join('|'), 'gi')
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

// An rgb channel: 0–255, or a percentage of 255.
const channel = (arg: string) => (arg.endsWith('%') ? (parseFloat(arg) / 100) * 255 : parseFloat(arg))

// A hue in degrees (deg, turn, rad or grad; bare numbers are degrees).
function hue(arg: string): number {
  const n = parseFloat(arg)
  if (arg.endsWith('turn')) return n * 360
  if (arg.endsWith('grad')) return n * 0.9
  if (arg.endsWith('rad')) return (n * 180) / Math.PI
  return n
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

// The colour a match names, or null when it is not one (rgb(foo), too few channels).
export function toRgbHex(code: string): string | null {
  const lower = code.toLowerCase()
  if (lower.startsWith('#')) return lower.slice(0, 7)
  const named = NAMED[lower]
  if (named !== undefined) return named

  const fn = /^(rgba?|hsla?)\((.*)\)$/s.exec(lower)
  if (!fn) return null
  const args = (fn[2] ?? '').trim().split(/[\s,/]+/).filter(Boolean)
  const [x, y, z] = args
  if (args.length > 4 || x === undefined || y === undefined || z === undefined) return null
  if ([x, y, z].some(a => Number.isNaN(parseFloat(a)))) return null

  if (fn[1]?.startsWith('rgb')) return toHex(channel(x), channel(y), channel(z))
  const pct = (a: string) => Math.max(0, Math.min(1, parseFloat(a) / 100))
  return toHex(...hslToRgb(hue(x), pct(y), pct(z)))
}

// Black or white, whichever reads better on the colour (WCAG relative luminance).
export function inkOn(hex: string): string {
  const linear = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [linear(1), linear(3), linear(5)]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#ffffff'
}
