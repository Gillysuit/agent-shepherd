import type { Color } from 'claude-code'

import type { AgentStatus, SessionStatus, Theme } from '../types'

// herdr's palette: a soft yellow for working, pink for blocked, teal for done,
// and a hollow green ring for idle, so a state reads by shape as well as hue.
// This session's card takes a fill a step off the pane, a quiet outline, and
// a lavender chip, a hue no state uses.
type Palette = {
  working: string
  blocked: string
  done: string
  idle: string
  failed: string
  stopped: string
  fill: string
  border: string
  chip: string
  label: string
}

// The pastels the pane was drawn with, for the desktop app's dark theme.
const DARK: Palette = {
  working: '#f9e2af',
  blocked: '#f38ba8',
  done: '#94e2d5',
  idle: '#a6e3a1',
  failed: '#eba0ac',
  stopped: '#7f849c',
  fill: '#24242b',
  border: '#45475a',
  chip: '#363548',
  label: '#cba6f7',
}

// The same hues deepened to read on a light pane, where the pastels wash out
// and a dark card swallows the black text; the card goes a step darker than
// the pane instead, with the chip a step darker again.
const LIGHT: Palette = {
  working: '#df8e1d',
  blocked: '#ea76cb',
  done: '#179299',
  idle: '#40a02b',
  failed: '#e64553',
  stopped: '#8c8fa1',
  fill: '#e6e9ef',
  border: '#bcc0cc',
  chip: '#ccd0da',
  label: '#8839ef',
}

export type Mark = { color: Color; glyph: string }

export type Marks = {
  session: Record<SessionStatus, Mark>
  agent: Record<AgentStatus, Mark>
  // The last field marks a state only subagents reach, left out when they are hidden.
  legend: readonly (readonly [Mark, string, boolean])[]
  mine: { fill: Color; border: Color; chip: Color; label: Color }
}

// Every dot, the legend and this session's card, in the colors of one theme.
export const marks = (theme: Theme): Marks => {
  const p = theme === 'light' ? LIGHT : DARK
  const session: Record<SessionStatus, Mark> = {
    working: { color: p.working, glyph: '●' },
    blocked: { color: p.blocked, glyph: '◉' },
    done: { color: p.done, glyph: '●' },
    idle: { color: p.idle, glyph: '○' },
  }
  const agent: Record<AgentStatus, Mark> = {
    working: session.working,
    blocked: session.blocked,
    done: session.done,
    failed: { color: p.failed, glyph: '✕' },
    stopped: { color: p.stopped, glyph: '○' },
  }
  return {
    session,
    agent,
    legend: [
      [session.working, 'working', false],
      [session.blocked, 'needs approval', false],
      [session.done, 'done', false],
      [session.idle, 'idle', false],
      [agent.failed, 'failed', true],
    ],
    mine: { fill: p.fill, border: p.border, chip: p.chip, label: p.label },
  }
}

// Sessions that need you sort first: blocked, then finished ones to review,
// then the busy ones, then the idle.
export const ORDER: Record<SessionStatus, number> = { blocked: 0, done: 1, working: 2, idle: 3 }
