import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'token-meter',
  component: 'AbovePrompt' as const,
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 200, scroll: { offset: 0, bodyRows: 4 }, view: {} },
}

const USAGE = {
  startedAt: 0,
  context: { tokens: 58_000, window: 100_000, percent: 58 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 61, resetsAt: new Date(2 * 3600_000 + 14 * 60_000).toISOString() }],
}

const STEP_USAGE = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 800 }

// Answers what token-meter asks Claude Code, with a store the test can read.
function stubs(on: any, id: string, saved = new Map<string, unknown>()) {
  const clock = mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('session.id', () => ({ value: id }))
  on('session.usage', () => ({ value: USAGE }))
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...saved.keys()] }))
  on('store.delete', (_$: unknown, e: { key: string }) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  on('classic.SessionStart', () => ({}))
  // Claude Code's own band is empty.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))
  on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: STEP_USAGE }
  })
  return { saved, clock }
}

async function step($: any, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1, ...(agentId ? { agentId } : {}) })
  let next = await stream.next()
  while (next.done !== true) next = await stream.next()
}

const bandText = async ($: any) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const total = (await ui.find({ type: 'Text', text: /^\d/ }))?.children?.[0]
  await ui.unmount()
  return total
}

test('counts each request and saves the tally under the session id', async ($, on) => {
  const { saved } = stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  expect(saved.get('s:abc')).toMatchObject({ tally: { input: 1000, output: 200, cacheRead: 3000, cacheWrite: 800 } })
  expect(await bandText($)).toBe('5k')
})

test('a session started again by id picks up its saved tally', async ($, on) => {
  stubs(on, 'abc', new Map([['s:abc', { tally: { input: 1_000_000, output: 200_000, cacheRead: 0, cacheWrite: 0 } }]]))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(await bandText($)).toBe('1.2M')
})

for (const source of ['resume', 'fork'] as const) {
  test(`after ${source}, the session's saved tally shows before the first prompt`, async ($, on) => {
    stubs(on, 'new', new Map([['s:old', { tally: { input: 40_000, output: 2_000, cacheRead: 0, cacheWrite: 0 } }]]))
    await $.classic.SessionStart({ source, session_id: 'old' })
    expect(await bandText($)).toBe('42k')
  })
}

test('after /clear the count starts at zero and saves under the new id', async ($, on) => {
  const { saved } = stubs(on, 'abc', new Map([['s:abc', { tally: { input: 9000, output: 0, cacheRead: 0, cacheWrite: 0 } }]]))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'clear', session_id: 'fresh' })
  expect(await bandText($)).toBe('0')
  await step($)
  expect(saved.get('s:fresh')).toMatchObject({ tally: { input: 1000, output: 200, cacheRead: 3000, cacheWrite: 800 } })
})

test('context and quota show as soon as the session starts', async ($, on) => {
  stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: ' 58%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '5h ' })).toBeDefined()
  await ui.unmount()
})

test("colours come from the theme: meters by heat, labels dimmed in the text colour", async ($, on) => {
  stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // 58% context is under 60%, 61% of the 5h window is over it.
  expect((await ui.find({ type: 'Text', text: ' 58%' }))?.props?.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: ' 61%' }))?.props?.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^\d/ }))?.props?.color).toBe('claude')
  const label = await ui.find({ type: 'Text', text: 'Context ' })
  expect(label?.props?.dimColor).toBe(true)
  expect(label?.props?.color).toBeUndefined()
  await ui.unmount()
})

test('the reset countdown keeps moving while nothing else changes', async ($, on) => {
  const { clock } = stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /2h14m$/ })).toBeDefined()
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /2h13m$/ })).toBeDefined()
  await ui.unmount()
})

// Draws its own line in the band and runs after token-meter.
const otherBand = {
  name: 'other-band',
  tier: 'append' as const,
  register(on: (...args: any[]) => void) {
    on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: ['another mod in the band'] })
    })
  },
}

test("another mod's band shows under the meter instead of being hidden", { plugins: [otherBand] }, async ($, on) => {
  stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Context ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'another mod in the band' })).toBeDefined()
  await ui.unmount()
})

test('keeps the 50 most recently used sessions and the one in use', async ($, on) => {
  const tally = { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }
  // 55 other sessions, last used at 0..54, and the one in use, last used longest ago.
  const old = new Map<string, unknown>([['s:abc', { tally }]])
  for (let n = 0; n < 55; n++) old.set(`s:${n}`, { tally, at: n })
  const { saved } = stubs(on, 'abc', old)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const left = [...saved.keys()].filter(key => key.startsWith('s:'))
  expect(left.length).toBe(50)
  expect(left).toContain('s:abc')
  expect(left).toContain('s:54')
  expect(left).toContain('s:6')
  expect(left).not.toContain('s:5')
})

const agentsText = async ($: any, bodyColumns = 200) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns } })
  const found = await ui.find({ type: 'Text', text: /^ \(agents / })
  await ui.unmount()
  return found
}

test("subagents' share shows dimmed after the total, which still includes it", async ($, on) => {
  const { saved } = stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  await step($, 'agent-1')
  // Each step is 5,000 tokens: 10k in all, 5k of it from the subagent.
  expect(await bandText($)).toBe('10k')
  const share = await agentsText($)
  expect(share?.children?.[0]).toBe(' (agents 5k)')
  expect(share?.props?.dimColor).toBe(true)
  expect(saved.get('s:abc')).toMatchObject({ agents: 5000 })
})

test('with no subagent use the line is unchanged', async ($, on) => {
  stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  expect(await agentsText($)).toBeUndefined()
})

test("the subagents' share is the first thing dropped in the compact layout", async ($, on) => {
  stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($, 'agent-1')
  expect(await agentsText($, 200)).toBeDefined()
  // 15 columns is too narrow for the medium layout, even with one section per row.
  expect(await agentsText($, 15)).toBeUndefined()
})

test("a resumed session brings back its subagents' share", async ($, on) => {
  stubs(on, 'new', new Map([['s:old', { tally: { input: 40_000, output: 2_000, cacheRead: 0, cacheWrite: 0 }, agents: 12_000 }]]))
  await $.classic.SessionStart({ source: 'resume', session_id: 'old' })
  expect((await agentsText($))?.children?.[0]).toBe(' (agents 12k)')
})
