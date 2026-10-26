import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-shepherd',
  component: 'Pane',
  requestId: 'agent-shepherd',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const MARKS = /^[●○◉✕]$/
const Y = '#f9e2af'
const PINK = '#f38ba8'
const TEAL = '#94e2d5'
const GREEN = '#a6e3a1'
const MAROON = '#eba0ac'

test('sessions and subagents show their state, on every surface', async ($, on) => {
  // Each hook here stands for the engine beneath the mod; files live in memory.
  const files = new Map<string, string>()
  const opened: string[][] = []
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  // A heartbeat from before hostId existed: shown, but not a link.
  files.set(
    '/home/t/.claude/agent-shepherd/sessions/s3.json',
    JSON.stringify({ id: 's3', project: 'old-project', title: 'Old', status: 'idle', since: 0 }),
  )
  files.set(
    '/home/t/.claude/agent-shepherd/sessions/s2.json',
    JSON.stringify({
      id: 's2',
      hostId: 'local_s2',
      project: 'my-site.com',
      title: 'Fix the RSS feed',
      status: 'idle',
      since: Date.now() - 60_000,
      agentsActive: 0,
      updatedAt: Date.now(),
      ended: false,
    }),
  )
  on('command.register', () => ({ value: { command: 'shepherd' } }))
  let opens = 0
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/t' : 'local_s1' }))
  on('process.run', (_, e) => {
    opened.push([...e.argv])
    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('classic.PermissionRequest', () => ({}))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/home/t/Developer/my-app' }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', () => ({
    value: [...files.entries()].map(([path, text]) => ({
      name: path.split('/').pop() ?? path,
      kind: 'file' as const,
      size: text.length,
      mtimeMs: Date.now(),
      isLink: false,
    })),
  }))
  on('fs.read', (_, e) => ({
    value: files.get(`/home/t/.claude/agent-shepherd/sessions/${e.path.split('/').pop()}`) ?? '',
  }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // The pane opens with the session, once: a reload's second start leaves it be.
  expect(opens).toBe(1)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opens).toBe(1)
  await $.prompt.submit({
    text: 'Redesign the mobile login',
    wait: false,
    origin: { kind: 'composer' },
  })
  await $.turn.start({ text: 'Redesign the mobile login', turnId: 'm1' })
  await $.agent.spawn({
    prompt: 'find the config',
    description: 'Find config files',
    subagentType: 'Explore',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })

  // Subagents start collapsed; the header opens them.
  const first = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await first.find({ type: 'Text', text: /Find config files/ })).toBeUndefined()
  expect(await first.find({ key: 'open-s3' })).toBeUndefined()
  await first.press({ key: 'toggle-agents' })
  await first.unmount()

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Redesign/ }))?.text).toBe(
      'Redesign the mobile login',
    )
    expect(
      await ui.find({ type: 'Text', text: /^working \d+s · my-app( · 1 agent)?$/ }),
    ).toBeDefined()
    // This session alone is outlined and labeled.
    expect((await ui.find({ type: 'Text', text: 'CURRENT' }))?.props.color).toBe('#cba6f7')
    const outlined = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle === 'round')
    expect(outlined).toHaveLength(1)
    expect(outlined[0]?.text).toContain('Redesign the mobile login')
    expect(await ui.find({ type: 'Text', text: /^working · Explore · 0 tools$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /needs approval/ })).toBeDefined()
    await ui.unmount()
  }

  // Every dot takes its legend color and sits outside any button, which the
  // desktop would draw in its own text color.
  const look = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const marks = (await look.findAll({ type: 'Text', text: MARKS })).map(t => [t.text, t.props.color])
  // This session working, two idle ones, the subagent working, then the legend.
  expect(marks).toEqual([
    ['●', Y], ['○', GREEN], ['○', GREEN], ['●', Y],
    ['●', Y], ['◉', PINK], ['●', TEAL], ['○', GREEN], ['✕', MAROON],
  ])
  const buttons = await look.findAll({ type: 'Button' })
  expect(buttons.map(b => b.text)).toEqual(['⚙', 'Open', '▾ Subagents'])
  expect(buttons.some(b => MARKS.test(b.text.slice(0, 1)))).toBe(false)
  expect(await look.find({ type: 'Text', text: /restart it to enable Open/ })).toBeDefined()
  expect(await look.find({ type: 'Text', text: 'needs approval' })).toBeDefined()
  await look.unmount()

  // Another session's title opens it in the desktop app.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'open-s2' })
  expect(opened).toEqual([['open', 'claude://claude.ai/epitaxy/local_s2']])
  await pane.unmount()

  // Finishing a turn chimed once; a permission dialog chimes and blocks.
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
  expect(opened.at(-1)?.[1]).toMatch(/attention\.wav$/)
  const blocked = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await blocked.find({ type: 'Text', text: /^blocked \d+s · my-app/ })).toBeDefined()
  await blocked.unmount()

  await $.turn.complete({
    answer: 'found it',
    durationMs: 1200,
    isAborted: false,
    turnId: 't1',
    agentId: 'a1',
    reason: 'answer',
  })
  await $.turn.complete({
    answer: 'done',
    durationMs: 5000,
    isAborted: false,
    turnId: 'm1',
    reason: 'answer',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // An answered turn leaves the session done, and chimes.
  expect(await ui.find({ type: 'Text', text: /^done \d+s · my-app/ })).toBeDefined()
  expect(opened.filter(argv => argv[0] === 'afplay').map(argv => argv[1]?.split('/').pop())).toEqual([
    'attention.wav',
    'done.wav',
  ])
  expect(await ui.find({ type: 'Text', text: /^done · Explore/ })).toBeDefined()
  await ui.unmount()

  // The gear swaps in settings; a change is saved and hides idle sessions.
  const prefs = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await prefs.press({ key: 'open-settings' })
  const toggles = await prefs.findAll({ type: 'Button' })
  expect(toggles.map(b => [b.text, b.props.variant])).toEqual([
    ['Done', undefined],
    ['On', 'primary'], // open in every new session
    ['Off', 'secondary'], // hide subagents
    ['On', 'primary'], // start collapsed
    ['Off', 'secondary'], // hide idle
    ['Off', 'secondary'], // hide finished
    ['Choose…', undefined], // pick the sounds folder in the Finder
    ['Show', undefined], // open the sounds folder in the Finder
    ['▶', undefined], // play the done sound
    ['▶', undefined], // play the approval sound
  ])
  expect((await prefs.find({ key: 'setting-stale' }))?.props.value).toBe('30')
  expect((await prefs.find({ key: 'setting-done-sound' }))?.props.value).toBe('chime')
  // Picking a macOS sound saves it and plays it once, from where the system keeps it.
  await prefs.select({ key: 'setting-done-sound', value: 'Glass' })
  expect(store.get('settings')).toMatchObject({ doneSound: 'Glass' })
  expect(opened.at(-1)).toEqual(['afplay', '/System/Library/Sounds/Glass.aiff'])
  // ▶ plays the chosen sound again, through afplay like every sound.
  await prefs.press({ key: 'play-attentionSound' })
  expect(opened.at(-1)?.[0]).toBe('afplay')
  expect(opened.at(-1)?.[1]).toMatch(/\/sounds\/attention\.wav$/)
  await prefs.press({ key: 'setting-hideIdle' })
  expect(store.get('settings')).toMatchObject({ hideIdle: true })
  await prefs.press({ key: 'close-settings' })
  expect(await prefs.find({ type: 'Text', text: /Fix the RSS feed/ })).toBeUndefined()

  // Hiding subagents drops their section and their two legend colors.
  await prefs.press({ key: 'open-settings' })
  await prefs.press({ key: 'setting-hideAgents' })
  await prefs.press({ key: 'close-settings' })
  expect(await prefs.find({ key: 'toggle-agents' })).toBeUndefined()
  expect(await prefs.find({ type: 'Text', text: /Find config files/ })).toBeUndefined()
  // This session (done), then the four session states in the legend.
  expect((await prefs.findAll({ type: 'Text', text: MARKS })).map(t => [t.text, t.props.color])).toEqual([
    ['●', TEAL], ['●', Y], ['◉', PINK], ['●', TEAL], ['○', GREEN],
  ])
  await prefs.unmount()
})
