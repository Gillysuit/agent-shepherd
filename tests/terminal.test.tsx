import { expect, test } from 'claude-code/testing'

test('in the terminal CLI the mod stays out of the way', async ($, on) => {
  // Each hook here stands for the engine beneath the mod, counting what it is asked.
  const asked: string[] = []
  on('command.register', () => {
    asked.push('command')
    return { value: { command: 'shepherd' } }
  })
  on('ui.open', () => {
    asked.push('pane')
    return { value: { isPlaced: true } }
  })
  on('process.run', () => {
    asked.push('process')
    return {
      value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('fs.write', () => {
    asked.push('heartbeat')
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 'm1' })
  await $.turn.complete({
    answer: 'hello',
    durationMs: 1000,
    isAborted: false,
    turnId: 'm1',
    reason: 'answer',
  })

  // No command, no pane, no chime, no heartbeat.
  expect(asked).toEqual([])
})
