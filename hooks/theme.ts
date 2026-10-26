import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Theme } from '../types'

const theme = atom({ plugin: 'agent-shepherd', key: 'theme' } as const, 'dark')

// How often the theme is read again, so a switch in the app's settings or in
// the system appearance recolors every open pane within a few seconds.
export const THEME_MS = 5000

// The desktop app keeps its appearance choice in its own config: 'light',
// 'dark' or 'system', which follows the Mac's appearance. Undocumented, like
// the session records: a file that does not fit reads as 'system'.
const configPath = (home: string) => `${home}/Library/Application Support/Claude/config.json`

const parseMode = (text: string): 'light' | 'dark' | 'system' => {
  try {
    const value: unknown = JSON.parse(text)
    const mode =
      typeof value === 'object' && value !== null ? (value as { userThemeMode?: unknown }).userThemeMode : null
    return mode === 'light' || mode === 'dark' ? mode : 'system'
  } catch {
    return 'system'
  }
}

// macOS answers 'Dark' when the system appearance is dark, and fails when it
// is light, where the key does not exist. Where `defaults` cannot run at all,
// the pane keeps the dark look it was drawn for.
async function systemTheme($: EngineInterface): Promise<Theme> {
  const ran = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle']).catch(() => null)
  if (ran === null) return 'dark'
  return ran.exitCode === 0 && ran.stdout.trim() === 'Dark' ? 'dark' : 'light'
}

// The theme the pane is drawn in. In the desktop app, the app's own choice,
// or the system's when it follows that; anywhere else, Claude Code's own
// theme setting (/config), whose light themes all start with 'light'. The
// app starts its sessions with no surface and attaches after, so whether this
// is the app is read from the session's surfaces each time, never once at start.
export async function detectTheme($: EngineInterface): Promise<Theme> {
  const surfaces = await $.session.surfaces().catch(() => [])
  if (surfaces.includes('desktop')) {
    const home = (await $.env.get('HOME')) ?? ''
    const mode = parseMode(await $.fs.read(configPath(home)).catch(() => ''))
    return mode === 'system' ? systemTheme($) : mode
  }
  const row = (await $.config.list().catch(() => [])).find(r => r.key === 'theme')
  return typeof row?.value === 'string' && row.value.startsWith('light') ? 'light' : 'dark'
}

// Reads the theme and writes it only when it changed: a write redraws the pane.
export async function syncTheme($: EngineInterface) {
  const next = await detectTheme($)
  if ((await read($, theme)) !== next) await update($, theme, () => next)
}
