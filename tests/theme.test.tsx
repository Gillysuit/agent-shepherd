import { expect, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

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

// This session's card, its chip and its done dot, in each theme.
const DARK = { fill: '#24242b', label: '#cba6f7', dot: '#94e2d5' }
const LIGHT = { fill: '#e6e9ef', label: '#8839ef', dot: '#179299' }

const HOME = '/home/t'
const CONFIG = `${HOME}/Library/Application Support/Claude/config.json`

// The engine beneath the mod: files in memory, and what `defaults` answers for
// the system appearance ('Dark', or nothing, which fails as on a light Mac).
const world = (on: Parameters<TestBody>[1]) => {
  const files = new Map<string, string>()
  const system = { appearance: null as 'Dark' | null, theme: 'dark' }
  const inFolder = (dir: string) =>
    [...files.entries()].filter(([path]) => path.slice(0, path.lastIndexOf('/')) === dir)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? HOME : 'local_s1' }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_, e) => ({
    value: inFolder(e.path ?? '').map(([path, text]) => ({
      name: path.slice(path.lastIndexOf('/') + 1),
      kind: 'file' as const,
      size: text.length,
      mtimeMs: Date.now(),
      isLink: false,
    })),
  }))
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    return text === undefined ? { deny: 'missing' } : { value: text }
  })
  on('fs.stat', () => ({ deny: 'missing' }))
  on('process.run', (_, e) => {
    const isDefaults = e.argv[0] === 'defaults'
    return {
      value: {
        exitCode: isDefaults && system.appearance === null ? 1 : 0,
        stdout: isDefaults ? (system.appearance ?? '') : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('config.list', () => ({
    value: [
      {
        key: 'theme',
        label: 'Theme',
        kind: 'choice' as const,
        value: system.theme,
        provider: { plugin: 'engine', tier: 'core' as const },
        isLocked: false,
      },
    ],
  }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/w/my-app' }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'shepherd' } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return { files, system }
}

// Mounts the pane and reads the colors of this session's card.
const card = async ($: Engine, surface: 'desktop' | 'vscode') => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const box = (await ui.findAll({ type: 'Box' })).find(b => b.props.borderStyle === 'round')
  const chip = await ui.find({ type: 'Text', text: 'CURRENT' })
  const dot = await ui.find({ type: 'Text', text: '●' })
  await ui.unmount()
  return { fill: box?.props.backgroundColor, label: chip?.props.color, dot: dot?.props.color }
}

test('the pane follows the desktop app theme, and the system appearance when the app does', async ($, on) => {
  const { files, system } = world(on)

  // The app set to light: the card, its chip and the dots take the light palette.
  files.set(CONFIG, JSON.stringify({ userThemeMode: 'light' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 'm1' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'm1', reason: 'answer' })
  expect(await card($, 'desktop')).toEqual(LIGHT)

  // Following the system, on a dark Mac. A reload reads the theme again.
  files.set(CONFIG, JSON.stringify({ userThemeMode: 'system' }))
  system.appearance = 'Dark'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await card($, 'desktop')).toEqual(DARK)

  // Following the system, on a light Mac, which has no appearance key.
  system.appearance = null
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await card($, 'desktop')).toEqual(LIGHT)

  // The app set to dark, whatever the Mac says.
  files.set(CONFIG, JSON.stringify({ userThemeMode: 'dark' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await card($, 'desktop')).toEqual(DARK)

  // No config at all, or one that does not fit, reads as following the system.
  files.set(CONFIG, 'not json')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await card($, 'desktop')).toEqual(LIGHT)
  files.delete(CONFIG)
  system.appearance = 'Dark'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await card($, 'desktop')).toEqual(DARK)
})

test("outside the desktop app the pane follows Claude Code's own theme", async ($, on) => {
  const { files, system } = world(on)
  // The desktop config says light, but this is VS Code: the /config theme wins.
  files.set(CONFIG, JSON.stringify({ userThemeMode: 'light' }))
  system.theme = 'dark-daltonized'
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 'm1' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'm1', reason: 'answer' })
  expect(await card($, 'vscode')).toEqual(DARK)

  system.theme = 'light-ansi'
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  expect(await card($, 'vscode')).toEqual(LIGHT)
})
