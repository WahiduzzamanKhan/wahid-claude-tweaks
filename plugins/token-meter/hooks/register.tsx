import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Gauge, Tally } from '../types'

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
const gauge = atom({ plugin: 'token-meter', key: 'gauge' } as const, EMPTY)

type Entry = { tally: Tally }
// One coloured run of text; the line is a flat list of these.
type Seg = [text: string, color?: string, bold?: boolean]

const sum = (t: Tally) => t.input + t.output + t.cacheRead + t.cacheWrite

const fmt = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

const heat = (pct: number) => (pct >= 85 ? C.hot : pct >= 60 ? C.warn : C.ok)

// A full-height meter: the used part in its heat colour, the rest muted.
const meter = (pct: number, cells: number): Seg[] => {
  const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
  return [
    ['█'.repeat(filled), heat(pct)],
    ['█'.repeat(cells - filled), C.muted],
    [` ${Math.round(pct)}%`, heat(pct), true],
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

function sections(t: Tally, g: Gauge, now: number, level: Level): Seg[][] {
  const ctxPct = g.context?.percent ?? 0

  // Labels stay at every level: with no icons they are all that tells sections apart.
  const tokens: Seg[] = [['Tokens ', C.dim], [fmt(sum(t)), C.accent, true]]
  if (level === 0) tokens.push([` ↑${fmt(t.input + t.cacheRead + t.cacheWrite)} ↓${fmt(t.output)}`, C.dim])

  const context: Seg[] = [['Context ', C.dim]]
  if (level < 2) context.push(...meter(ctxPct, level === 0 ? 10 : 6))
  else context.push([`${Math.round(ctxPct)}%`, heat(ctxPct), true])

  // Every rate-limit window with its reset countdown; with none (API key or
  // usage-credit billing) fall back to what the session has cost.
  // The window names (5h, 7d) label themselves; only the fallback needs a label.
  const quota: Seg[] = []
  if (g.rateLimits.length > 0) {
    g.rateLimits.forEach((r, i) => {
      const reset = until(r.resetsAt, now)
      if (i > 0) quota.push([' │ ', C.muted])
      quota.push([`${LIMIT_NAMES[r.kind] ?? r.kind} `, C.dim])
      if (level < 2) quota.push(...meter(r.percentUsed, level === 0 ? 5 : 3))
      else quota.push([`${Math.round(r.percentUsed)}%`, heat(r.percentUsed), true])
      if (reset && level === 0) quota.push([`  \uf252 ${reset}`, C.dim])
    })
  } else {
    quota.push(['Quota ', C.dim])
    if (level < 2) quota.push(['N/A', C.muted])
    if (g.usd !== null) {
      if (level < 2) quota.push(['  Cost ', C.dim])
      quota.push([`$${g.usd.toFixed(2)}`, C.accent, true])
    }
  }

  return [tokens, context, quota]
}

const SEP: Seg = ['  │  ', C.muted]
const width = (segs: Seg[]) => segs.reduce((n, [text]) => n + text.length, 0)

// The breakpoints: the richest single row that fits; failing that, one row
// per section at the richest level whose widest section fits.
function layout(t: Tally, g: Gauge, now: number, columns: number): Seg[][] {
  const levels: Level[] = [0, 1, 2]
  for (const level of levels) {
    const [a = [], b = [], c = []] = sections(t, g, now, level)
    const row = [...a, SEP, ...b, SEP, ...c]
    if (width(row) <= columns) return [row]
  }
  for (const level of levels) {
    const rows = sections(t, g, now, level)
    if (Math.max(...rows.map(width)) <= columns) return rows
  }
  return sections(t, g, now, 2)
}

// Points the meter at a session: its saved tally (zero for a new one) and the
// window and quota figures as they stand now. A hot reload keeps the same id,
// and the tally with it.
async function follow($: EngineInterface, id: string) {
  if ((await read($, sessionId)) !== id) {
    const saved = (await $.store.get(`s:${id}`)) as Entry | undefined
    await update($, sessionId, () => id)
    await update($, session, () => saved?.tally ?? ZERO)
  }
  const usage = await $.session.usage()
  await update($, gauge, () => toGauge(usage))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await follow($, await $.session.id())
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

    const id = await read($, sessionId)
    if (id) {
      await $.store.set(`s:${id}`, { tally } satisfies Entry)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const t = await read($, session)
    const g = await read($, gauge)
    const rows = layout(t, g, await $.clock.now(), e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" paddingTop={1}>
        {rows.map((segs, r) => (
          <Box key={`r${r}`}>
            {segs.map(([text, color, bold], i) => (
              <Text key={`s${i}`} color={color === DIM ? undefined : color} dimColor={color === DIM} bold={bold} wrap="truncate">
                {text}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
