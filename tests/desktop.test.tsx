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

const RECORDS = '/home/t/Library/Application Support/Claude/claude-code-sessions/acct/org'
const PROJECTS = '/home/t/.claude/projects'

const line = (entry: object) => JSON.stringify(entry)

test('sessions without the mod come from the desktop app records', async ($, on) => {
  // Each hook here stands for the engine beneath the mod; files live in memory.
  const files = new Map<string, string>()
  const record = (id: string, cli: string, cwd: string, title: string, extra = {}) =>
    files.set(
      `${RECORDS}/local_${id}.json`,
      JSON.stringify({
        sessionId: `local_${id}`,
        cliSessionId: cli,
        cwd,
        title,
        isArchived: false,
        lastActivityAt: Date.now(),
        lastTurnEdgeAt: Date.now() - 5000,
        ...extra,
      }),
    )
  // Mid-turn: the last entry is a tool result.
  record('a', 'ca', '/w/my-app', 'Mobile post-login redesign')
  files.set(`${PROJECTS}/-w-my-app/ca.jsonl`, [
    line({ type: 'user', message: { content: 'go' } }),
    line({ type: 'assistant', message: { stop_reason: 'tool_use', content: [] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result' }] } }),
    line({ type: 'queue-operation' }),
  ].join('\n'))
  // Answered: done.
  record('b', 'cb', '/w/site.com', 'Fix the RSS feed')
  files.set(`${PROJECTS}/-w-site-com/cb.jsonl`, line({
    type: 'assistant', message: { stop_reason: 'end_turn', content: [] },
  }))
  // Archived: left out.
  record('c', 'cc', '/w/old', 'Archived one', { isArchived: true })
  files.set(`${PROJECTS}/-w-old/cc.jsonl`, '')
  // This session, which runs the mod: its heartbeat wins, the record's title with it.
  record('s', 's1', '/w/agent-shepherd', 'Claude mods')

  const inFolder = (dir: string) =>
    [...files.entries()].filter(([path]) => path.slice(0, path.lastIndexOf('/')) === dir)
  on('env.get', (_, e) => ({
    value: { HOME: '/home/t', CLAUDE_CODE_ACCOUNT_UUID: 'acct', CLAUDE_CODE_ORGANIZATION_UUID: 'org', CLAUDE_CODE_HOST_SESSION_ID: 'local_s' }[e.name],
  }))
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
  on('fs.stat', (_, e) =>
    files.has(e.path)
      ? { value: { kind: 'file' as const, size: 1, mtimeMs: Date.now(), isLink: false } }
      : { deny: 'missing' },
  )
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stdout: files.get(e.argv[e.argv.length - 1] ?? '') ?? '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('store.get', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/w/agent-shepherd' }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'shepherd' } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 'm1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('Claude mods')
  expect(texts).toContain('Mobile post-login redesign')
  expect(texts).toContain('Fix the RSS feed')
  expect(texts).not.toContain('Archived one')
  expect(texts.some(t => /^working \d+s · my-app$/.test(t))).toBe(true)
  expect(texts.some(t => /^done \d+s · site\.com$/.test(t))).toBe(true)
  // Every other session can be opened; this one has no Open of its own.
  const opens = (await ui.findAll({ type: 'Button' })).filter(b => b.text === 'Open')
  expect(opens.map(b => b.key).sort()).toEqual(['open-ca', 'open-cb'])
  await ui.unmount()
})
