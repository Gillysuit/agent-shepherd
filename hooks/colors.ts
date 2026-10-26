import type { Color } from 'claude-code'

import type { AgentStatus, SessionStatus } from '../types'

// herdr's palette: a soft yellow for working, pink for blocked, teal for done,
// and a hollow green ring for idle, so a state reads by shape as well as hue.
const WORKING = '#f9e2af'
const BLOCKED = '#f38ba8'
const DONE = '#94e2d5'
const IDLE = '#a6e3a1'
const FAILED = '#eba0ac'
const STOPPED = '#7f849c'

type Mark = { color: Color; glyph: string }

export const SESSION_MARK: Record<SessionStatus, Mark> = {
  working: { color: WORKING, glyph: '●' },
  blocked: { color: BLOCKED, glyph: '◉' },
  done: { color: DONE, glyph: '●' },
  idle: { color: IDLE, glyph: '○' },
}

export const AGENT_MARK: Record<AgentStatus, Mark> = {
  working: { color: WORKING, glyph: '●' },
  blocked: { color: BLOCKED, glyph: '◉' },
  done: { color: DONE, glyph: '●' },
  failed: { color: FAILED, glyph: '✕' },
  stopped: { color: STOPPED, glyph: '○' },
}

// The last field marks a state only subagents reach, left out when they are hidden.
export const LEGEND: readonly (readonly [Mark, string, boolean])[] = [
  [SESSION_MARK.working, 'working', false],
  [SESSION_MARK.blocked, 'needs approval', false],
  [SESSION_MARK.done, 'done', false],
  [SESSION_MARK.idle, 'idle', false],
  [AGENT_MARK.failed, 'failed', true],
]

// Sessions that need you sort first: blocked, then finished ones to review,
// then the busy ones, then the idle.
export const ORDER: Record<SessionStatus, number> = { blocked: 0, done: 1, working: 2, idle: 3 }
