import { expect, test } from 'claude-code/testing'

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
  on('fs.list', (_, e) => ({
    value: (folders.get(e.path ?? '') ?? []).map(name => ({
      name,
      kind: 'file' as const,
      size: 1,
      mtimeMs: Date.now(),
      isLink: false,
    })),
  }))
  on('fs.read', () => ({ value: '' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    played.push([...e.argv])
    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
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
  on('clock.every', () => ({ value: undefined }))
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
  expect((await prefs.find({ key: 'setting-sounds-folder' }))?.props.value).toBe(
    '~/.claude/agent-shepherd/sounds',
  )
  expect(await lastChoices()).toEqual([
    { value: `file:${MINE}/bark.wav`, label: 'bark' },
    { value: `file:${MINE}/meow.mp3`, label: 'meow' },
  ])

  // Picking one saves its path and plays it from the folder.
  await prefs.select({ key: 'setting-done-sound', value: `file:${MINE}/bark.wav` })
  expect(store.get('settings')).toMatchObject({ doneSound: `file:${MINE}/bark.wav` })
  expect(played.at(-1)).toEqual(['afplay', `${MINE}/bark.wav`])

  // A new folder is listed at once; the chosen sound stays, though it is elsewhere.
  await prefs.input({ key: 'setting-sounds-folder', text: '/music' })
  expect(store.get('settings')).toMatchObject({ soundsFolder: '/music' })
  expect(toasts.at(-1)).toBe('Found 1 sound')
  expect(await lastChoices()).toEqual([
    { value: 'file:/music/ding.aiff', label: 'ding' },
    { value: `file:${MINE}/bark.wav`, label: 'bark' },
  ])
  expect((await prefs.find({ key: 'setting-done-sound' }))?.props.value).toBe(`file:${MINE}/bark.wav`)
})
