import { expect, mock, test } from 'claude-code/testing'

const reply = (text: string) => ({ component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true } })

test('chips a hex code inside a drawn tree with its own colour', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, async () => ({
    type: 'Box',
    children: [{ type: 'Text', children: ['Accent is #c7910c here'] }],
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'color-preview', surface, ...reply('Accent is `#c7910c` here') })
    const chip = await ui.find({ type: 'Text', text: /^#c7910c$/ })
    expect(chip?.props?.backgroundColor).toBe('#c7910c')
    expect(chip?.props?.color).toBe('#000000')
    await ui.unmount()
  }
})

test('dark colours get white text, and #123 stays plain', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, async () => ({
    type: 'Text',
    children: ['bg #0e3b31 and issue #123'],
  }))
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply('bg #0e3b31 and issue #123') })
  expect((await ui.find({ type: 'Text', text: /^#0e3b31$/ }))?.props?.color).toBe('#ffffff')
  expect(await ui.find({ type: 'Text', text: /^#123$/ })).toBeUndefined()
  await ui.unmount()
})

test('a reply with no hex codes is left exactly as drawn', async ($, on) => {
  const tree = { type: 'Text' as const, children: ['nothing to see'] }
  on('ui.render', { component: 'AssistantMessage' }, async () => tree)
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply('nothing to see') })
  expect(await ui.find({ type: 'Text', text: /nothing to see/ })).toBeDefined()
  await ui.unmount()
})

test("Claude Code's own drawing gets a row of chips under it", async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'engine', ref: 0 }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'color-preview', surface, ...reply('Gold #c7910c, green #00A884, gold again #C7910C') })
    const chips = await ui.findAll({ type: 'Text', text: /^ #[0-9a-fA-F]{6} $/ })
    expect(chips.map(c => c.props?.backgroundColor)).toEqual(['#c7910c', '#00a884'])
    await ui.unmount()
  }
})

test('rgb, rgba, hsl and hsla codes are chipped with the colour they name', async ($, on) => {
  const line = 'a rgb(199, 145, 12) b rgba(0 168 132 / 50%) c hsl(120, 100%, 25%) d hsla(0deg 100% 50% / .3)'
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'Text', children: [line] }))
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply(line) })
  const bg = async (code: RegExp) => (await ui.find({ type: 'Text', text: code }))?.props?.backgroundColor
  expect(await bg(/^rgb\(199, 145, 12\)$/)).toBe('#c7910c')
  expect(await bg(/^rgba\(0 168 132 \/ 50%\)$/)).toBe('#00a884')
  expect(await bg(/^hsl\(120, 100%, 25%\)$/)).toBe('#008000')
  expect(await bg(/^hsla\(0deg 100% 50% \/ \.3\)$/)).toBe('#ff0000')
  await ui.unmount()
})

test('named colours are chipped wherever they are written, as whole words only', async ($, on) => {
  const line = 'the red line uses RebeccaPurple, not darkred or reduce'
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'Text', children: [line] }))
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply(line) })
  const bg = async (code: RegExp) => (await ui.find({ type: 'Text', text: code }))?.props?.backgroundColor
  expect(await bg(/^red$/)).toBe('#ff0000')
  expect(await bg(/^RebeccaPurple$/)).toBe('#663399')
  expect(await bg(/^darkred$/)).toBe('#8b0000')
  expect(await ui.find({ type: 'Text', text: /^reduce$/ })).toBeUndefined()
  await ui.unmount()
})

test('a function that is not a colour stays plain', async ($, on) => {
  const line = 'call rgb(foo) here'
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'Text', children: [line] }))
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply(line) })
  expect(await ui.find({ type: 'Text', text: /^rgb\(foo\)$/ })).toBeUndefined()
  await ui.unmount()
})

const PANE = {
  component: 'Pane' as const,
  requestId: 'color-preview-settings',
  props: {
    title: 'Color preview',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline' as const,
    scroll: { offset: 0, bodyRows: 8 },
    view: {},
  },
}

test('the settings pane switches a format off, saves it, and replies stop painting it', async ($, on) => {
  // The store beneath the plugin, kept here so the test can read what was saved.
  const saved = new Map<string, unknown>()
  on('store.set', async (_$, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  const line = 'the red line, #c7910c'
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'Text', children: [line] }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'color-preview', surface, ...PANE })
    expect((await pane.find({ key: 'named' }))?.props?.label).toMatch(/^● CSS names/)
    await pane.press({ key: 'named' })
    expect((await pane.find({ key: 'named' }))?.props?.label).toMatch(/^○ CSS names/)
    expect(saved.get('formats')).toEqual({ hex: true, rgb: true, hsl: true, named: false })

    const ui = await $.ui.mount({ plugin: 'color-preview', surface, ...reply(line) })
    expect(await ui.find({ type: 'Text', text: /^red$/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^#c7910c$/ }))?.props?.backgroundColor).toBe('#c7910c')
    await ui.unmount()

    await pane.press({ key: 'named' })
    await pane.unmount()
  }
})

test('with every format off a reply is left as drawn', async ($, on) => {
  mock.store(on)
  const line = 'red #c7910c rgb(1, 2, 3) hsl(1, 2%, 3%)'
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'Text', children: [line] }))
  const pane = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...PANE })
  for (const key of ['hex', 'rgb', 'hsl', 'named']) await pane.press({ key })
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply(line) })
  expect(await ui.find({ type: 'Text', text: /^red$|^#c7910c$|^rgb|^hsl/ })).toBeUndefined()
  await ui.unmount()
  await pane.unmount()
})

test('saved formats come back after /clear', async ($, on) => {
  on('store.get', async (_$, e) => ({ value: e.key === 'formats' ? { named: false } : undefined }))
  on('classic.SessionStart', () => ({}))
  const line = 'the red line, #c7910c'
  on('ui.render', { component: 'AssistantMessage' }, async () => ({ type: 'Text', children: [line] }))
  await $.classic.SessionStart({ source: 'clear' })

  const pane = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...PANE })
  expect((await pane.find({ key: 'named' }))?.props?.label).toMatch(/^○ CSS names/)
  const ui = await $.ui.mount({ plugin: 'color-preview', surface: 'terminal', ...reply(line) })
  expect(await ui.find({ type: 'Text', text: /^red$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^#c7910c$/ })).toBeDefined()
  await ui.unmount()
  await pane.unmount()
})
