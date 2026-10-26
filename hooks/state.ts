import type { AgentRow, HerdSettings } from '../types'
import { isSound } from './sounds'

export const PANE = 'agent-shepherd'
export const TITLE = 'Agents'

export const isActive = (row: AgentRow) =>
  row.status === 'working' || row.status === 'blocked'

export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`
}

export const SETTINGS_KEY = 'settings'

export const DEFAULT_SETTINGS: HerdSettings = {
  openOnStart: true,
  doneSound: 'chime',
  attentionSound: 'beep',
  hideAgents: false,
  collapseAgents: true,
  hideIdle: false,
  hideFinished: false,
  staleSeconds: 30,
  recentMinutes: 120,
}

export const STALE_CHOICES = [30, 60, 120, 300] as const
// In seconds, like the stale choices, so one dropdown draws both.
export const RECENT_CHOICES = [30 * 60, 2 * 3600, 8 * 3600, 24 * 3600] as const

const silenced = (saved: object) => 'sounds' in saved && saved.sounds === false

// The store holds JSON another version may have written: keep what fits.
export const normalizeSettings = (value: unknown): HerdSettings => {
  const saved = typeof value === 'object' && value !== null ? (value as Partial<HerdSettings>) : {}
  const flag = (key: 'openOnStart' | 'hideAgents' | 'collapseAgents' | 'hideIdle' | 'hideFinished') =>
    typeof saved[key] === 'boolean' ? saved[key] : DEFAULT_SETTINGS[key]
  return {
    openOnStart: flag('openOnStart'),
    // An older store kept one on/off switch for both sounds.
    doneSound: isSound(saved.doneSound) ? saved.doneSound : silenced(saved) ? 'off' : DEFAULT_SETTINGS.doneSound,
    attentionSound: isSound(saved.attentionSound)
      ? saved.attentionSound
      : silenced(saved) ? 'off' : DEFAULT_SETTINGS.attentionSound,
    hideAgents: flag('hideAgents'),
    collapseAgents: flag('collapseAgents'),
    hideIdle: flag('hideIdle'),
    hideFinished: flag('hideFinished'),
    staleSeconds:
      typeof saved.staleSeconds === 'number' && saved.staleSeconds > 0
        ? saved.staleSeconds
        : DEFAULT_SETTINGS.staleSeconds,
    recentMinutes:
      typeof saved.recentMinutes === 'number' && saved.recentMinutes > 0
        ? saved.recentMinutes
        : DEFAULT_SETTINGS.recentMinutes,
  }
}

export const sameSettings = (a: HerdSettings, b: HerdSettings) =>
  a.openOnStart === b.openOnStart &&
  a.doneSound === b.doneSound &&
  a.attentionSound === b.attentionSound &&
  a.hideAgents === b.hideAgents &&
  a.collapseAgents === b.collapseAgents &&
  a.hideIdle === b.hideIdle &&
  a.hideFinished === b.hideFinished &&
  a.staleSeconds === b.staleSeconds &&
  a.recentMinutes === b.recentMinutes
