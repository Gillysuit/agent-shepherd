import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-shepherd',
  component: 'Pane',
  requestId: 'agent-shepherd',
  surface: 'desktop',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const MINE = '/home/t/.claude/agent-shepherd/sounds'

test('sounds in the person’s folder join the choices, and play from there', async ($, on) => {
  // Each hook here stands for the engine beneath the mod; folders live in memory.
  const folders = new Map<string, string[]>([
    [MINE, ['meow.mp3', 'bark.wav', 'notes.txt']],
    ['/music', ['ding.aiff']],
  ])
  const store = new Map<string, unknown>()
  const played: string[][] = []
  const toasts: string[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  let listings = 0
  on('fs.list', (_, e) => {
    if (e.path === MINE) listings += 1
    return {
    value: (folders.get(e.path ?? '') ?? []).map(name => ({
      name,
      kind: 'file' as const,
      size: 1,
      mtimeMs: Date.now(),
      isLink: false,
    })),
  }})
  on('fs.read', () => ({ value: '' }))
  on('fs.write', () => ({ value: undefined }))
  // The Finder's chooser answers with the folder picked, as osascript prints it.
  let picked = '/music/\n'
  on('process.run', (_, e) => {
    played.push([...e.argv])
    const stdout = e.argv[0] === 'osascript' ? picked : ''
    return {
      value: { exitCode: stdout ? 0 : 1, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/t' : undefined }))
  on('command.register', () => ({ value: { command: 'shepherd' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  const clock = mock.clock(on, { now: Date.now() })
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/home/t/my-app' }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const prefs = await $.ui.mount(PANE)
  await prefs.press({ key: 'open-settings' })
  // The last two choices in the done dropdown, where the folder's sounds go.
  const lastChoices = async () => {
    const options: unknown = (await prefs.find({ key: 'setting-done-sound' }))?.props.options
    return Array.isArray(options) ? options.slice(-2) : []
  }

  // The default folder is read with no setup; only its audio files are offered.
  expect(
    await prefs.find({ type: 'Text', text: '~/.claude/agent-shepherd/sounds · 2 sounds in the lists below' }),
  ).toBeDefined()
  expect(await lastChoices()).toEqual([
    { value: `file:${MINE}/bark.wav`, label: 'bark' },
    { value: `file:${MINE}/meow.mp3`, label: 'meow' },
  ])

  // Left alone, settings never redraws: a redraw jumps an open dropdown back
  // to its choice. Each draw lists the folder, so the listings count draws.
  const before = listings
  await clock.advance(10_000)
  expect(listings - before).toBe(0)

  // Picking one saves its path and plays it from the folder.
  await prefs.select({ key: 'setting-done-sound', value: `file:${MINE}/bark.wav` })
  expect(store.get('settings')).toMatchObject({ doneSound: `file:${MINE}/bark.wav` })
  expect(played.at(-1)).toEqual(['afplay', `${MINE}/bark.wav`])

  // Show opens the folder in the Finder, made first so there is somewhere to drop sounds.
  await prefs.press({ key: 'show-sounds-folder' })
  expect(played.slice(-2)).toEqual([['mkdir', '-p', MINE], ['open', MINE]])

  // Choose opens the Finder's chooser on the current folder; a new folder is
  // listed at once, and the chosen sound stays, though it is elsewhere.
  await prefs.press({ key: 'choose-sounds-folder' })
  expect(played.at(-1)?.[0]).toBe('osascript')
  expect(played.at(-1)?.at(-1)).toBe(MINE)
  expect(store.get('settings')).toMatchObject({ soundsFolder: '/music' })
  expect(toasts.at(-1)).toBe('Found 1 sound')
  expect(await lastChoices()).toEqual([
    { value: 'file:/music/ding.aiff', label: 'ding' },
    { value: `file:${MINE}/bark.wav`, label: 'bark' },
  ])
  expect((await prefs.find({ key: 'setting-done-sound' }))?.props.value).toBe(`file:${MINE}/bark.wav`)

  // A folder in the home folder is saved with ~; a cancel changes nothing.
  picked = '/home/t/Music/\n'
  await prefs.press({ key: 'choose-sounds-folder' })
  expect(store.get('settings')).toMatchObject({ soundsFolder: '~/Music' })
  picked = ''
  await prefs.press({ key: 'choose-sounds-folder' })
  expect(store.get('settings')).toMatchObject({ soundsFolder: '~/Music' })
})
