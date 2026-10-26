import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, AgentStatus, SelfState, SessionStatus } from '../types'
import { beat, recoverTitle, refresh, settingsFromOldName, sync } from './heartbeat'
import { renderPane } from './renderPane'
import { playSound } from './sounds'
import { DEFAULT_SETTINGS, PANE, SETTINGS_KEY, TITLE, isActive, normalizeSettings } from './state'

const IDLE: SelfState = { title: '', status: 'idle', since: 0 }
const agents = atom({ plugin: 'agent-shepherd', key: 'agents' } as const, [])
const now = atom({ plugin: 'agent-shepherd', key: 'now' } as const, 0)
const self = atom({ plugin: 'agent-shepherd', key: 'self' } as const, IDLE)
const settings = atom({ plugin: 'agent-shepherd', key: 'settings' } as const, DEFAULT_SETTINGS)
const autoOpened = atom({ plugin: 'agent-shepherd', key: 'autoOpened' } as const, false)

const HEARTBEAT_MS = 3000

// Plays the sound the settings pick for this moment, if any.
const chime = async ($: EngineInterface, moment: 'done' | 'attention') => {
  const prefs = await read($, settings)
  void playSound($, moment === 'done' ? prefs.doneSound : prefs.attentionSound)
}

const patchAgent = (
  $: EngineInterface,
  id: string,
  fn: (row: AgentRow) => AgentRow,
) => update($, agents, list => list.map(row => (row.id === id ? fn(row) : row)))

const agentSummary = (list: AgentRow[]) =>
  (['working', 'blocked'] as const)
    .map(status => [status, list.filter(r => r.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`)
    .join(' · ')

// Redraws elapsed times and the status line every second.
const tick = async ($: EngineInterface) => {
  await update($, now, () => Date.now())
  const list = await read($, agents)
  if (list.some(isActive)) await $.ui.status(`agents: ${agentSummary(list)}`)
}

// Sets this session's own state and publishes it at once.
const setStatus = async ($: EngineInterface, status: SessionStatus) => {
  await update($, self, me =>
    me.status === status ? me : { ...me, status, since: Date.now() },
  )
  void sync($).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'shepherd',
      description: 'Show the agent and session status pane',
    })
    // The title comes from the conversation's first prompt, read again at each
    // start or reload so one picked up mid-session is replaced.
    await update($, self, me => ({ ...me, title: '', since: me.since || Date.now() }))
    await recoverTitle($)
    $.clock.every(1000, () => void tick($).catch(() => undefined))
    $.clock.every(HEARTBEAT_MS, () => void sync($).catch(() => undefined))
    void sync($).catch(() => undefined)

    // Read the store itself: the settings atom fills only after the first sync.
    const saved = await $.store.get(SETTINGS_KEY).catch(() => undefined)
    const prefs = normalizeSettings(saved ?? (await settingsFromOldName($)))
    if (saved === undefined) await $.store.set(SETTINGS_KEY, prefs).catch(() => undefined)
    await update($, settings, () => prefs)
    // Once per session: a reload runs session.start again, and a pane closed
    // since should stay closed.
    if (prefs.openOnStart && !(await read($, autoOpened))) {
      await update($, autoOpened, () => true)
      void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await beat($, true).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'shepherd' }, async $ => {
    await refresh($).catch(() => undefined)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Agent pane opened.' }
  })

  // The first prompt names this session in every pane, as the sidebar does.
  on('prompt.submit', async ($, e, next) => {
    const title = e.text.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (title && !e.text.startsWith('/')) {
      await update($, self, me => (me.title ? me : { ...me, title }))
    }
    return next(e)
  }).catch(() => undefined)

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = started.agentId ?? `${e.tool_use_id}:${e.description}`
    const row: AgentRow = {
      id,
      description: e.description,
      type: e.subagentType,
      isBackground: e.background,
      status: 'working',
      startedAt: Date.now(),
      endedAt: null,
      tools: 0,
      lastTool: null,
    }
    await update($, agents, list => [...list.filter(r => r.id !== id), row].slice(-50))
    await update($, now, () => Date.now())
    void $.ui.open({ id: PANE, title: TITLE })

    return started
  }).catch(() => undefined)

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await setStatus($, 'working')
    } else {
      // A resumed agent (SendMessage) starts a new turn in the same loop.
      await patchAgent($, e.agentId, row => ({ ...row, status: 'working', endedAt: null }))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      await patchAgent($, id, row => ({ ...row, tools: row.tools + 1, lastTool: e.tool }))
    }
    const ran = await next(e)
    if (id === undefined) {
      if ((await read($, self)).status === 'blocked') await setStatus($, 'working')
    } else {
      await patchAgent($, id, row => (row.status === 'blocked' ? { ...row, status: 'working' } : row))
    }
    return ran
  }).catch(() => undefined)

  // Fires only when a permission dialog is actually put to you, not for the
  // asks auto mode settles by itself; the tool.call hook clears it after.
  on('classic.PermissionRequest', async ($, e, next) => {
    const id = e.agent_id
    await chime($, 'attention')
    if (id === undefined) await setStatus($, 'blocked')
    else await patchAgent($, id, row => ({ ...row, status: 'blocked' }))
    return next(e)
  }).catch(() => undefined)

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) {
      // An answered turn is done until the next one starts; an interrupted or
      // failed one just goes idle. While subagents still run, each one that
      // finishes wakes a short turn of its own: those keep the session working
      // and stay silent, so the chime comes once, after the last.
      const isWaiting = (await read($, agents)).some(isActive)
      if (e.reason !== 'answer') await setStatus($, 'idle')
      else if (isWaiting) await setStatus($, 'working')
      else {
        await setStatus($, 'done')
        await chime($, 'done')
      }
    } else {
      const status: AgentStatus =
        e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
      await patchAgent($, id, row => ({ ...row, status, endedAt: Date.now() }))
      if (!(await read($, agents)).some(isActive)) await $.ui.status(undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'agent-shepherd' }, renderPane)
}
