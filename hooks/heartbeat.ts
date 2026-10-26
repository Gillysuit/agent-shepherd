import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SelfState, SessionBeat } from '../types'
import { desktopSessions } from './desktopSessions'
import type { DesktopRecord } from './desktopSessions'
import { DEFAULT_SETTINGS, SETTINGS_KEY, isActive, normalizeSettings, sameSettings } from './state'

const IDLE: SelfState = { title: '', status: 'idle', since: 0 }
const agents = atom({ plugin: 'agent-herd', key: 'agents' } as const, [])
const self = atom({ plugin: 'agent-herd', key: 'self' } as const, IDLE)
const sessions = atom({ plugin: 'agent-herd', key: 'sessions' } as const, [])
const settings = atom({ plugin: 'agent-herd', key: 'settings' } as const, DEFAULT_SETTINGS)

async function folder($: EngineInterface) {
  return `${(await $.env.get('HOME')) ?? ''}/.claude/agent-herd/sessions`
}

const parse = (text: string): SessionBeat | null => {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) return null
  const row = value as Partial<SessionBeat>
  return typeof row.id === 'string' && typeof row.status === 'string'
    ? (row as SessionBeat)
    : null
}

// A session that was already running when the mod loaded never saw its first
// prompt: read it back from the conversation instead.
export async function recoverTitle($: EngineInterface) {
  const messages = await $.session.messages().catch(() => [])
  const first = messages.find(m => m.role === 'user' && m.text.trim() && !/^[<\/]/.test(m.text))
  const title = first?.text.replace(/\s+/g, ' ').trim().slice(0, 60) ?? ''
  if (title) await update($, self, me => (me.title ? me : { ...me, title }))
}

// Writes this session's status where every other session's pane can read it.
export async function beat($: EngineInterface, ended = false) {
  if (!(await read($, self)).title) await recoverTitle($)
  const [id, hostId, cwd, me, list] = await Promise.all([
    $.session.id(),
    $.env.get('CLAUDE_CODE_HOST_SESSION_ID'),
    $.session.cwd(),
    read($, self),
    read($, agents),
  ])
  const row: SessionBeat = {
    id,
    hostId: hostId ?? null,
    project: cwd.split('/').filter(Boolean).pop() ?? cwd,
    title: me.title,
    status: me.status,
    since: me.since,
    agentsActive: list.filter(isActive).length,
    updatedAt: Date.now(),
    ended,
  }
  await $.fs.write(`${await folder($)}/${id}.json`, JSON.stringify(row))
}

// Reads every session that wrote a heartbeat recently, and settings another
// session may have changed.
export async function refresh($: EngineInterface) {
  const saved = normalizeSettings(await $.store.get(SETTINGS_KEY))
  await update($, settings, current => (sameSettings(current, saved) ? current : saved))
  const dir = await folder($)
  const entries = await $.fs.list(dir).catch(() => [])
  // A session whose file has not been written for this long has closed.
  const cutoff = Date.now() - saved.staleSeconds * 1000
  const fresh = entries.filter(
    entry => entry.kind === 'file' && entry.name.endsWith('.json') && entry.mtimeMs > cutoff,
  )
  const rows = await Promise.all(
    fresh.map(entry =>
      $.fs.read(`${dir}/${entry.name}`).then(parse).catch(() => null),
    ),
  )
  const beats = rows.filter((row): row is SessionBeat => row !== null && !row.ended)

  // The desktop app's records add the sessions that do not run the mod, and
  // give every row the sidebar's own title and an id Open can use.
  const home = (await $.env.get('HOME')) ?? ''
  const desktop = await desktopSessions($, home, saved.recentMinutes * 60_000).catch(() => null)
  const records = desktop?.records ?? new Map<string, DesktopRecord>()
  const watched = beats.map(row => {
    const record = records.get(row.id)
    return {
      ...row,
      title: record?.title || row.title,
      hostId: row.hostId ?? record?.sessionId ?? null,
      source: 'heartbeat' as const,
    }
  })
  const seen = new Set(watched.map(row => row.id))
  const unwatched = (desktop?.rows ?? []).filter(row => !seen.has(row.id))
  await update($, sessions, () => [...watched, ...unwatched])
}

export async function sync($: EngineInterface) {
  await beat($)
  await refresh($)
}
