export type AgentStatus = 'working' | 'blocked' | 'done' | 'failed' | 'stopped'

export type AgentRow = {
  id: string
  description: string
  type: string
  isBackground: boolean
  status: AgentStatus
  startedAt: number
  endedAt: number | null
  tools: number
  lastTool: string | null
}

export type SessionStatus = 'working' | 'blocked' | 'done' | 'idle'

// This session's own state, which its heartbeat publishes.
export type SelfState = {
  title: string
  status: SessionStatus
  since: number
}

// One session's heartbeat file, as every pane reads it.
export type SessionBeat = {
  id: string
  // The desktop app's id for the session, which its deep link opens; null outside the app.
  hostId: string | null
  project: string
  title: string
  status: SessionStatus
  since: number
  agentsActive: number
  updatedAt: number
  ended: boolean
  // Where the row came from: a session's own heartbeat, or the desktop app's
  // record for a session that does not run the mod.
  source?: 'heartbeat' | 'desktop'
}

// The pane's preferences, kept in the mod's store and shared by every session.
export type HerdSettings = {
  openOnStart: boolean
  // 'off', one of the mod's chimes, a macOS system sound's name, or
  // 'file:' and the path of a sound from the person's folder.
  doneSound: string
  attentionSound: string
  // Where the person's own sounds are; '~' is their home folder.
  soundsFolder: string
  hideAgents: boolean
  collapseAgents: boolean
  hideIdle: boolean
  hideFinished: boolean
  // Smaller text and no gaps between rows, for a small screen.
  compact: boolean
  staleSeconds: number
  recentMinutes: number
}

export type PaneView = 'list' | 'settings'

// Which look the pane draws in: the desktop app's theme, read from the app.
export type Theme = 'dark' | 'light'

declare module 'claude-code' {
  interface PluginState {
    'agent-shepherd': {
      agents: AgentRow[]
      now: number
      self: SelfState
      sessions: SessionBeat[]
      // null follows the collapseAgents setting until the header is pressed.
      agentsOpen: boolean | null
      settings: HerdSettings
      view: PaneView
      theme: Theme
      autoOpened: boolean
      // Counts changes seen in the sounds folder while settings is open.
      soundsStamp: number
    }
  }
}
