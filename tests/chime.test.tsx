import { expect, test } from 'claude-code/testing'

const spawn = (description: string) => ({
  prompt: description,
  description,
  subagentType: 'general-purpose',
  tool_use_id: `tu-${description}`,
  provider: { plugin: 'engine', tier: 'core' } as const,
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

const finish = (turnId: string, agentId?: string) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId,
  ...(agentId ? { agentId } : {}),
  reason: 'answer' as const,
})

test('background subagents finishing do not chime; the last answer does, once', async ($, on) => {
  // Each hook here stands for the engine beneath the mod.
  const played: string[] = []
  on('process.run', (_, e) => {
    if (e.argv[0] === 'afplay') played.push(e.argv[1]?.split('/').pop() ?? '')
    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  let next = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `a${++next}` }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('command.register', () => ({ value: { command: 'shepherd' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.messages', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'review the PR', turnId: 'm1' })
  await $.agent.spawn(spawn('one'))
  await $.agent.spawn(spawn('two'))
  // The main turn hands off to the two background agents: still working, no chime.
  await $.turn.complete(finish('m1'))
  expect(played).toEqual([])

  // The first agent's result wakes a short main turn: still silent.
  await $.turn.complete(finish('t1', 'a1'))
  await $.turn.start({ text: '', turnId: 'm2' })
  await $.turn.complete(finish('m2'))
  expect(played).toEqual([])

  // The last one's result ends it all: one chime.
  await $.turn.complete(finish('t2', 'a2'))
  await $.turn.start({ text: '', turnId: 'm3' })
  await $.turn.complete(finish('m3'))
  expect(played).toEqual(['done.wav'])
})
