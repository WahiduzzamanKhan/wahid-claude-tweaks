import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage, Timer } from 'claude-code'

import type { Gauge, Prefs, Tally } from '../types'

// Theme keys, so the meter follows whatever theme is in use. Labels have no
// key of their own: DIM draws them in the theme's text colour, dimmed.
const DIM = 'dim'
const C = {
  accent: 'claude',
  ok: 'success',
  warn: 'warning',
  hot: 'error',
  muted: 'inactive',
  dim: DIM,
}

const ZERO: Tally = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const EMPTY: Gauge = { context: null, rateLimits: [], usd: null }

const sessionId = atom({ plugin: 'token-meter', key: 'sessionId' } as const, '')
const session = atom({ plugin: 'token-meter', key: 'session' } as const, ZERO)
// The part of the tally subagents used, every kind of token together.
const agents = atom({ plugin: 'token-meter', key: 'agents' } as const, 0)
const gauge = atom({ plugin: 'token-meter', key: 'gauge' } as const, EMPTY)

const DEFAULTS: Prefs = { tokens: true, agents: true, context: true, quota: true, hourglass: true, warnAt: 60, hotAt: 85 }
const prefs = atom({ plugin: 'token-meter', key: 'prefs' } as const, DEFAULTS)

// A threshold as typed: a whole percentage from 1 to 99, or why it is refused.
function threshold(typed: string, which: 'warnAt' | 'hotAt', p: Prefs): number | string {
  const n = Number(typed.trim().replace(/%$/, ''))
  if (!Number.isInteger(n) || n < 1 || n > 99) return 'Type a whole number from 1 to 99.'
  if (which === 'warnAt' && n >= p.hotAt) return `Amber has to start below red (${p.hotAt}%).`
  if (which === 'hotAt' && n <= p.warnAt) return `Red has to start above amber (${p.warnAt}%).`
  return n
}

// Why the last typed threshold was refused, shown in the pane until the next one is set.
let refusal = ''

// A session's saved tally and when it last changed, in $.clock.now() milliseconds.
type Entry = { tally: Tally; agents?: number; at?: number }
// One coloured run of text; the line is a flat list of these.
type Seg = [text: string, color?: string, bold?: boolean]

const sum = (t: Tally) => t.input + t.output + t.cacheRead + t.cacheWrite

const fmt = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

const heat = (pct: number, p: Prefs) => (pct >= p.hotAt ? C.hot : pct >= p.warnAt ? C.warn : C.ok)

// A full-height meter: the used part in its heat colour, the rest muted.
const meter = (pct: number, cells: number, p: Prefs): Seg[] => {
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
  return [
    ['█'.repeat(filled), heat(pct, p)],
    ['█'.repeat(cells - filled), C.muted],
    [` ${Math.round(pct)}%`, heat(pct, p), true],
  ]
}

const until = (iso: string | undefined, now: number) => {
  const at = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(at) || at <= now) return ''
  const mins = Math.round((at - now) / 60000)
  if (mins >= 24 * 60) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  return `${mins}m`
}

const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'Spend' }

// Plain copies: the state value holds only what the contract declares.
const toGauge = (u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): Gauge => ({
  context: { tokens: u.context.tokens, window: u.context.window, percent: u.context.percent },
  rateLimits: u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
  usd: u.cost?.usd ?? null,
})

// Detail levels, widest first: 0 full, 1 medium (short meters, no breakdown),
// 2 compact (labels and numbers only).
type Level = 0 | 1 | 2

// The sections switched on, in order: Tokens, Context, Quota.
function sections(t: Tally, sub: number, g: Gauge, now: number, level: Level, p: Prefs): Seg[][] {
  const ctxPct = g.context?.percent ?? 0

  // Labels stay at every level: with no icons they are all that tells sections apart.
  const tokens: Seg[] = [['Tokens ', C.dim], [fmt(sum(t)), C.accent, true]]
  if (level === 0) tokens.push([` ↑${fmt(t.input + t.cacheRead + t.cacheWrite)} ↓${fmt(t.output)}`, C.dim])
  // The total includes subagents; their share follows it, dropped first when space runs out.
  if (p.agents && sub > 0 && level < 2) tokens.push([` (agents ${fmt(sub)})`, C.dim])

  const context: Seg[] = [['Context ', C.dim]]
  if (level < 2) context.push(...meter(ctxPct, level === 0 ? 10 : 6, p))
  else context.push([`${Math.round(ctxPct)}%`, heat(ctxPct, p), true])

  // Every rate-limit window with its reset countdown; with none (API key or
  // usage-credit billing) fall back to what the session has cost.
  // The window names (5h, 7d) label themselves; only the fallback needs a label.
  const quota: Seg[] = []
  if (g.rateLimits.length > 0) {
    g.rateLimits.forEach((r, i) => {
      const reset = until(r.resetsAt, now)
      if (i > 0) quota.push([' │ ', C.muted])
      quota.push([`${LIMIT_NAMES[r.kind] ?? r.kind} `, C.dim])
      if (level < 2) quota.push(...meter(r.percentUsed, level === 0 ? 5 : 3, p))
      else quota.push([`${Math.round(r.percentUsed)}%`, heat(r.percentUsed, p), true])
      if (reset && level === 0) quota.push([`  ${p.hourglass ? '\uf252 ' : ''}${reset}`, C.dim])
    })
  } else {
    quota.push(['Quota ', C.dim])
    if (level < 2) quota.push(['N/A', C.muted])
    if (g.usd !== null) {
      if (level < 2) quota.push(['  Cost ', C.dim])
      quota.push([`$${g.usd.toFixed(2)}`, C.accent, true])
    }
  }

  const shown: Seg[][] = []
  if (p.tokens) shown.push(tokens)
  if (p.context) shown.push(context)
  if (p.quota) shown.push(quota)
  return shown
}

const SEP: Seg = ['  │  ', C.muted]
const width = (segs: Seg[]) => segs.reduce((n, [text]) => n + text.length, 0)

// The breakpoints: the richest single row that fits; failing that, one row
// per section at the richest level whose widest section fits.
function layout(t: Tally, sub: number, g: Gauge, now: number, columns: number, p: Prefs): Seg[][] {
  const levels: Level[] = [0, 1, 2]
  for (const level of levels) {
    const row = sections(t, sub, g, now, level, p).flatMap((s, i) => (i > 0 ? [SEP, ...s] : s))
    if (width(row) <= columns) return row.length > 0 ? [row] : []
  }
  for (const level of levels) {
    const rows = sections(t, sub, g, now, level, p)
    if (Math.max(...rows.map(width)) <= columns) return rows
  }
  return sections(t, sub, g, now, 2, p)
}

// How many sessions' tallies are kept; the store is shared and capped, and an
// old session is rarely resumed.
const KEEP = 50

// Deletes all but the KEEP most recently used tallies, never the session in use.
async function prune($: EngineInterface, current: string) {
  const keys = (await $.store.keys()).filter(key => key.startsWith('s:') && key !== `s:${current}`)
  if (keys.length < KEEP) return
  const ages = await Promise.all(keys.map(async key => ({ key, at: ((await $.store.get(key)) as Entry | undefined)?.at ?? 0 })))
  ages.sort((a, b) => b.at - a.at)
  for (const { key } of ages.slice(KEEP - 1)) await $.store.delete(key)
}

// Points the meter at a session: its saved tally (zero for a new one) and the
// window and quota figures as they stand now. A hot reload keeps the same id,
// and the tally with it. Saved settings win; a setting added later starts at its default.
async function follow($: EngineInterface, id: string) {
  const saved = (await $.store.get('prefs')) as Partial<Prefs> | undefined
  await update($, prefs, () => ({ ...DEFAULTS, ...saved }))

  if ((await read($, sessionId)) !== id) {
    const saved = (await $.store.get(`s:${id}`)) as Entry | undefined
    await update($, sessionId, () => id)
    await update($, session, () => saved?.tally ?? ZERO)
    await update($, agents, () => saved?.agents ?? 0)
  }
  const usage = await $.session.usage()
  await update($, gauge, () => toGauge(usage))
}

const PANE = 'token-meter-settings'

// The settings pane's switches: each one, its hotkey and what it changes.
const SWITCHES: { key: 'tokens' | 'agents' | 'context' | 'quota' | 'hourglass'; hotkey: string; label: string; note: string }[] = [
  { key: 'tokens', hotkey: '1', label: 'Tokens', note: 'this session\'s total, with input and output' },
  { key: 'agents', hotkey: '2', label: 'Subagents\' share', note: 'shown after the total, as in (agents 300k)' },
  { key: 'context', hotkey: '3', label: 'Context', note: 'how full the context window is' },
  { key: 'quota', hotkey: '4', label: 'Quota', note: 'plan limits, or cost without them' },
  { key: 'hourglass', hotkey: '5', label: 'Hourglass icon', note: 'before reset countdowns; needs a Nerd Font' },
]

// The settings pane's thresholds, typed in as percentages.
const THRESHOLDS: { key: 'warnAt' | 'hotAt'; label: string }[] = [
  { key: 'warnAt', label: 'Amber from %' },
  { key: 'hotAt', label: 'Red from %' },
]

// Rows of coloured runs as Text in Boxes, for the band and the pane's preview.
function drawRows(Box: (props: any) => any, Text: (props: any) => any, rows: Seg[][]) {
  return rows.map((segs, r) => (
    <Box key={`r${r}`}>
      {segs.map(([text, color, bold], i) => (
        <Text key={`s${i}`} color={color === DIM ? undefined : color} dimColor={color === DIM} bold={bold} wrap="truncate">
          {text}
        </Text>
      ))}
    </Box>
  ))
}

// The reset countdowns move with the clock, not with usage, so the band is
// redrawn each minute even while nothing else changes.
let tick: Timer | null = null

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'token-meter', description: 'Choose what the token meter shows and when it turns amber and red' })
    const id = await $.session.id()
    await follow($, id)
    await prune($, id)
    tick?.cancel()
    tick = $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    return result
  })

  // /clear, /resume and /branch (reported as fork) reset state to its defaults
  // and session.start does not fire again, so follow the session here too.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const result = await next(e)
    await follow($, e.session_id)
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, gauge, () => toGauge(e))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (!u) return result

    const tally = await update($, session, t => ({
      input: t.input + u.input_tokens,
      output: t.output + u.output_tokens,
      cacheRead: t.cacheRead + u.cache_read_input_tokens,
      cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
    }))

    const used = u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    const sub = e.agentId ? await update($, agents, n => n + used) : await read($, agents)

    const id = await read($, sessionId)
    if (id) {
      await $.store.set(`s:${id}`, { tally, agents: sub, at: await $.clock.now() } satisfies Entry)
    }

    return result
  })

  on('command.run', { command: 'token-meter' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Token meter', focus: true, closeOnEscape: true, rows: SWITCHES.length + 11 })
    return { text: 'Token meter settings opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The mobile app draws no text field; there the thresholds are only shown.
    const Input = 'Input' in ui ? ui.Input : null
    const now = await read($, prefs)
    const change = (fn: (p: Prefs) => Prefs) => async () => {
      const next = await update($, prefs, fn)
      await $.store.set('prefs', next)
    }
    const preview = layout(await read($, session), await read($, agents), await read($, gauge), await $.clock.now(), e.props.bodyColumns, now)

    return (
      <Box flexDirection="column">
        <Text dimColor>Press a key to change a setting. Saved for every session.</Text>
        <Box flexDirection="column" paddingTop={1}>
          {SWITCHES.map(row => (
            <Box flexDirection="row" columnGap={2}>
              <Button
                plain
                key={row.key}
                hotkey={row.hotkey}
                label={`${now[row.key] ? '●' : '○'} ${row.label.padEnd(16)}`}
                dimColor={!now[row.key]}
                onPress={change(p => ({ ...p, [row.key]: !p[row.key] }))}
              />
              <Text dimColor>{row.note}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" paddingTop={1}>
          {Input === null ? (
            <Text dimColor>{`Amber from ${now.warnAt}%, red from ${now.hotAt}%. Change them in the terminal or the desktop app.`}</Text>
          ) : (
            <Text dimColor>Tab to a threshold, type a percentage and press Enter.</Text>
          )}
          {Input !== null && THRESHOLDS.map(row => (
            <Input
              key={row.key}
              label={row.label}
              // The field empties after Enter, so the value in force shows as its
              // placeholder rather than as text the field would drop.
              value=""
              placeholder={String(now[row.key])}
              submitLabel="set"
              onSubmit={async (typed: string) => {
                const n = threshold(typed, row.key, await read($, prefs))
                refusal = typeof n === 'string' ? n : ''
                if (typeof n === 'number') await change(p => ({ ...p, [row.key]: n }))()
                $.ui.invalidate('ui.render')
              }}
            />
          ))}
          {refusal ? <Text color="error">{refusal}</Text> : null}
        </Box>
        <Box flexDirection="column" paddingTop={1}>
          <Text dimColor>Preview</Text>
          {preview.length > 0 ? drawRows(Box, Text, preview) : <Text dimColor>Every section is off, so the band is empty.</Text>}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const p = await read($, prefs)
    const rows = layout(await read($, session), await read($, agents), await read($, gauge), await $.clock.now(), e.props.bodyColumns, p)
    // What the mods after this one draw in the band (a skin's usage meters,
    // say) goes under the line instead of being hidden by it.
    const theirs = await next(e)
    if (rows.length === 0) return theirs

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" paddingTop={1}>
        {drawRows(Box, Text, rows)}
        {theirs}
      </Box>
    )
  })
}
