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
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('session.id', () => ({ value: id }))
  on('session.usage', () => ({ value: USAGE }))
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('classic.SessionStart', () => ({}))
  on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: STEP_USAGE }
  })
  return saved
}

async function step($: any) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1 })
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
  const saved = stubs(on, 'abc')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await step($)
  expect(saved.get('s:abc')).toEqual({ tally: { input: 1000, output: 200, cacheRead: 3000, cacheWrite: 800 } })
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
  const saved = stubs(on, 'abc', new Map([['s:abc', { tally: { input: 9000, output: 0, cacheRead: 0, cacheWrite: 0 } }]]))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'clear', session_id: 'fresh' })
  expect(await bandText($)).toBe('0')
  await step($)
  expect(saved.get('s:fresh')).toEqual({ tally: { input: 1000, output: 200, cacheRead: 3000, cacheWrite: 800 } })
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
