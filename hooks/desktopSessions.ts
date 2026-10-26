import type { EngineInterface } from 'claude-code'

import type { SessionBeat, SessionStatus } from '../types'

// The desktop app's own record of each Code session. Undocumented: read what
// is there and skip a record that does not fit, so an app update hides rows
// rather than breaking the pane.
export type DesktopRecord = {
  sessionId: string
  cliSessionId: string
  cwd: string
  title: string
  isArchived: boolean
  lastActivityAt: number
  lastTurnEdgeAt: number
}

// A turn quiet for this long has stalled or died: show the session idle.
const STALLED_MS = 30 * 60_000

// Each transcript's state, kept while its file is unchanged.
const transcriptStates = new Map<string, { mtimeMs: number; status: SessionStatus }>()

const parseRecord = (text: string): DesktopRecord | null => {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) return null
  const r = value as Partial<DesktopRecord>
  if (typeof r.sessionId !== 'string' || typeof r.cliSessionId !== 'string') return null
  return {
    sessionId: r.sessionId,
    cliSessionId: r.cliSessionId,
    cwd: typeof r.cwd === 'string' ? r.cwd : '',
    title: typeof r.title === 'string' ? r.title : '',
    isArchived: r.isArchived === true,
    lastActivityAt: typeof r.lastActivityAt === 'number' ? r.lastActivityAt : 0,
    lastTurnEdgeAt: typeof r.lastTurnEdgeAt === 'number' ? r.lastTurnEdgeAt : 0,
  }
}

// Reads a transcript's last entries: an answered turn is done, an interrupted
// one idle, anything else (a prompt, a tool call or its result) mid-turn.
const statusFromTail = (tail: string, mtimeMs: number): SessionStatus => {
  const lines = tail.split('\n').filter(Boolean).reverse()
  for (const line of lines) {
    let entry: { type?: unknown; message?: { stop_reason?: unknown; content?: unknown } }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type !== 'user' && entry.type !== 'assistant') continue
    if (entry.type === 'assistant' && entry.message?.stop_reason === 'end_turn') return 'done'
    const content = JSON.stringify(entry.message?.content ?? '')
    if (entry.type === 'user' && content.includes('[Request interrupted')) return 'idle'
    return Date.now() - mtimeMs > STALLED_MS ? 'idle' : 'working'
  }
  return 'idle'
}

// Where Claude Code keeps a session's transcript: its folder with every
// character but letters and digits turned to a dash.
const transcriptPath = (home: string, record: DesktopRecord) =>
  `${home}/.claude/projects/${record.cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${record.cliSessionId}.jsonl`

async function transcriptStatus($: EngineInterface, path: string): Promise<SessionStatus | null> {
  const stat = await $.fs.stat(path).catch(() => null)
  if (stat === null) return null
  const cached = transcriptStates.get(path)
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.status
  // Transcripts run to tens of megabytes, past what one read may copy: tail it.
  const tail = await $.process.run(['tail', '-n', '40', path]).catch(() => null)
  if (tail === null || tail.exitCode !== 0) return null
  const status = statusFromTail(tail.stdout, stat.mtimeMs)
  transcriptStates.set(path, { mtimeMs: stat.mtimeMs, status })
  return status
}

async function recordsFolder($: EngineInterface, home: string) {
  const [account, org] = await Promise.all([
    $.env.get('CLAUDE_CODE_ACCOUNT_UUID'),
    $.env.get('CLAUDE_CODE_ORGANIZATION_UUID'),
  ])
  if (!account || !org) return null
  return `${home}/Library/Application Support/Claude/claude-code-sessions/${account}/${org}`
}

// The desktop app's sessions active within the window, each as a row with the
// app's own title and id; state comes from the transcript, since these sessions
// may not run the mod. `records` holds every one, for the rows that do.
export async function desktopSessions(
  $: EngineInterface,
  home: string,
  windowMs: number,
): Promise<{ rows: SessionBeat[]; records: Map<string, DesktopRecord> }> {
  const records = new Map<string, DesktopRecord>()
  const folder = await recordsFolder($, home)
  if (folder === null) return { rows: [], records }
  const cutoff = Date.now() - windowMs
  const entries = await $.fs.list(folder).catch(() => [])
  const fresh = entries.filter(
    e => e.kind === 'file' && e.name.startsWith('local_') && e.name.endsWith('.json') && e.mtimeMs > cutoff,
  )
  const parsed = await Promise.all(
    fresh.map(e => $.fs.read(`${folder}/${e.name}`).then(parseRecord).catch(() => null)),
  )
  const rows: SessionBeat[] = []
  for (const record of parsed) {
    if (record === null || record.isArchived || record.lastActivityAt < cutoff) continue
    records.set(record.cliSessionId, record)
    const status = await transcriptStatus($, transcriptPath(home, record))
    if (status === null) continue
    rows.push({
      id: record.cliSessionId,
      hostId: record.sessionId,
      project: record.cwd.split('/').filter(Boolean).pop() ?? record.cwd,
      title: record.title,
      status,
      since: record.lastTurnEdgeAt || record.lastActivityAt,
      agentsActive: 0,
      updatedAt: Date.now(),
      ended: false,
      source: 'desktop',
    })
  }
  return { rows, records }
}
