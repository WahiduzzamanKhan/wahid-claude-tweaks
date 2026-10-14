import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Formats } from '../types'
import { ALL_ON, inkOn, patternFor, toRgbHex } from './colors'

type Node = RenderElement | string

const PANE = 'color-preview-settings'
const formats = atom({ plugin: 'color-preview', key: 'formats' } as const, ALL_ON)

// The settings pane's rows: each format, its hotkey and what it catches.
const ROWS: { key: keyof Formats; hotkey: string; label: string; sample: string[] }[] = [
  { key: 'hex', hotkey: '1', label: 'Hex', sample: ['#c7910c', '#00a88480'] },
  { key: 'rgb', hotkey: '2', label: 'RGB / RGBA', sample: ['rgb(199, 145, 12)', 'rgba(0 168 132 / 50%)'] },
  { key: 'hsl', hotkey: '3', label: 'HSL / HSLA', sample: ['hsl(270, 50%, 40%)', 'hsla(4 75% 55% / .5)'] },
  { key: 'named', hotkey: '4', label: 'CSS names', sample: ['rebeccapurple', 'tomato'] },
]

// The code itself as a chip: its own colour behind it. Same width as the
// plain text, so table columns another plugin lined up stay lined up.
const chip = (code: string, rgb: string): RenderElement => ({
  type: 'Text',
  props: { backgroundColor: rgb, color: inkOn(rgb) },
  children: [code],
})

function split(text: string, pattern: RegExp): Node[] | null {
  const parts: Node[] = []
  let at = 0
  for (const m of text.matchAll(pattern)) {
    const rgb = toRgbHex(m[0])
    if (rgb === null) continue
    if (m.index > at) parts.push(text.slice(at, m.index))
    parts.push(chip(m[0], rgb))
    at = m.index + m[0].length
  }
  if (at === 0) return null
  if (at < text.length) parts.push(text.slice(at))
  return parts
}

// Walks a drawn tree and chips every colour code in its strings, each string
// becoming a Text of plain runs and chips (valid under a Box and inside a Text).
// Leaves (Code, Markdown, Svg, the engine's own drawing) are left as drawn.
function paint(node: Node, pattern: RegExp, hits: { n: number }): Node {
  if (typeof node === 'string') {
    const parts = split(node, pattern)
    if (parts === null) return node
    hits.n += 1
    return { type: 'Text', children: parts }
  }
  if ((node.type === 'Box' || node.type === 'Text') && node.children) {
    return { ...node, children: node.children.map(c => paint(c as Node, pattern, hits)) as RenderElement[] }
  }
  return node
}

// Each colour the text names once, as written first, with the colour it paints.
function codesIn(text: string, pattern: RegExp) {
  const seen = new Map<string, { code: string; rgb: string }>()
  for (const m of text.matchAll(pattern)) {
    const rgb = toRgbHex(m[0])
    const key = m[0].toLowerCase().replace(/\s+/g, '')
    if (rgb !== null && !seen.has(key)) seen.set(key, { code: m[0], rgb })
  }
  return [...seen.values()]
}

// Saved choices win; a format added later starts on.
async function loadSaved($: EngineInterface) {
  const saved = (await $.store.get('formats')) as Partial<Formats> | undefined
  await update($, formats, () => ({ ...ALL_ON, ...saved }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'color-preview', description: 'Choose which colour formats get painted in replies' })
    await loadSaved($)
    return result
  })

  // /clear resets state to its defaults and session.start does not fire again, so load the saved choices here too.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear') await loadSaved($)
    return result
  })

  on('command.run', { command: 'color-preview' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Color preview', focus: true, closeOnEscape: true, rows: ROWS.length + 4 })
    return { text: 'Color preview settings opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await read($, formats)
    const toggle = (key: keyof Formats) => async () => {
      const next = await update($, formats, f => ({ ...f, [key]: !f[key] }))
      await $.store.set('formats', next)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>Press 1–4 to switch a format on or off. Saved for every session.</Text>
        <Box flexDirection="column" paddingTop={1}>
          {ROWS.map(row => (
            <Box flexDirection="row" columnGap={2}>
              <Button
                plain
                key={row.key}
                hotkey={row.hotkey}
                label={`${now[row.key] ? '●' : '○'} ${row.label.padEnd(10)}`}
                dimColor={!now[row.key]}
                onPress={toggle(row.key)}
              />
              {row.sample.map(code => {
                const rgb = toRgbHex(code) ?? '#808080'
                return now[row.key] ? (
                  <Text backgroundColor={rgb} color={inkOn(rgb)}>
                    {code}
                  </Text>
                ) : (
                  <Text dimColor>{code}</Text>
                )
              })}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    // Read while drawing, so a toggle in the pane repaints every reply.
    const pattern = patternFor(await read($, formats))
    if (pattern === null) return drawn
    const codes = codesIn(e.props.text, pattern)
    if (codes.length === 0) return drawn

    const hits = { n: 0 }
    const painted = paint(drawn, pattern, hits) as RenderElement
    if (hits.n > 0) return painted

    // Drawn by something this cannot reach into (Claude Code's own markdown,
    // a card): show the colours in a row under it instead.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {drawn}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingLeft={2}>
          {codes.map(({ code, rgb }) => (
            <Text backgroundColor={rgb} color={inkOn(rgb)}>
              {` ${code} `}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
