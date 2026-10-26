import type { EngineInterface } from 'claude-code'

// The two chimes the mod ships, then the sounds every Mac has. The macOS ones
// play from where the system keeps them; nothing of Apple's is copied here.
const MOD_SOUNDS: Record<string, { label: string; asset: string }> = {
  chime: { label: 'Rising chime', asset: 'sounds/done.wav' },
  beep: { label: 'Double beep', asset: 'sounds/attention.wav' },
}

const MAC_SOUNDS = [
  'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero',
  'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink',
] as const

export type SoundOption = { value: string; label: string }

export const SOUND_OPTIONS: readonly SoundOption[] = [
  { value: 'off', label: 'Off' },
  ...Object.entries(MOD_SOUNDS).map(([value, { label }]) => ({ value, label })),
  ...MAC_SOUNDS.map(name => ({ value: name, label: name })),
]

// A sound from the person's own folder is saved by its whole path, so it keeps
// playing after the folder setting changes.
const FILE = 'file:'
const AUDIO = /\.(wav|aiff?|mp3|m4a|caf)$/i

export const DEFAULT_SOUNDS_FOLDER = '~/.claude/agent-shepherd/sounds'

export const isSound = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value.startsWith(`${FILE}/`) || SOUND_OPTIONS.some(option => option.value === value))

// A file's name without its extension, as the dropdown shows it.
export const fileLabel = (value: string) =>
  (value.split('/').pop() ?? value).replace(/\.[^.]+$/, '')

export async function expandHome($: EngineInterface, path: string) {
  if (path !== '~' && !path.startsWith('~/')) return path
  return `${(await $.env.get('HOME')) ?? ''}${path.slice(1)}`
}

// The audio files in the person's sounds folder, by name; a missing or
// unreadable folder has none.
export async function folderSounds($: EngineInterface, folder: string): Promise<SoundOption[]> {
  const dir = (await expandHome($, folder.trim())).replace(/\/+$/, '')
  if (!dir) return []
  const entries = await $.fs.list(dir).catch(() => [])
  return entries
    .filter(entry => (entry.kind === 'file' || entry.isLink) && AUDIO.test(entry.name))
    .map(entry => `${FILE}${dir}/${entry.name}`)
    .sort((a, b) => a.localeCompare(b))
    .map(value => ({ value, label: fileLabel(value) }))
}

// The Finder's folder chooser, opened on the current folder where it exists.
// Waits while the person looks; a cancel or a failure picks nothing.
const CHOOSE_FOLDER = [
  'on run argv',
  'activate',
  'set msg to "Choose a folder of sounds"',
  'try',
  'set start to (POSIX file (item 1 of argv)) as alias',
  'on error',
  'return POSIX path of (choose folder with prompt msg)',
  'end try',
  'return POSIX path of (choose folder with prompt msg default location start)',
  'end run',
]

export async function chooseFolder($: EngineInterface, current: string): Promise<string | null> {
  const start = await expandHome($, current.trim())
  const lines = CHOOSE_FOLDER.flatMap(line => ['-e', line])
  const result = await $.process
    .run(['osascript', ...lines, start], { timeoutMs: 10 * 60_000 })
    .catch(() => null)
  const picked = result?.exitCode === 0 ? result.stdout.trim().replace(/\/+$/, '') : ''
  if (!picked) return null
  // Saved the way it is shown, with the home folder as ~.
  const home = (await $.env.get('HOME')) ?? ''
  return home && (picked === home || picked.startsWith(`${home}/`)) ? `~${picked.slice(home.length)}` : picked
}

// Opens the folder in the Finder, making it first so there is somewhere to
// drop sounds.
export async function showFolder($: EngineInterface, folder: string) {
  const dir = await expandHome($, folder.trim())
  if (!dir) return
  await $.process.run(['mkdir', '-p', dir]).catch(() => undefined)
  await $.process.run(['open', dir]).catch(() => undefined)
}

// Plays a sound by its setting's value; off, unknown or unplayable stays silent.
// Every sound goes through afplay, the mod's own chimes included, so one path
// is known to work wherever the Open button does.
export async function playSound($: EngineInterface, name: string) {
  const mine = MOD_SOUNDS[name]
  const path = mine
    ? `${$.plugin.root}/${mine.asset}`
    : name.startsWith(`${FILE}/`)
      ? name.slice(FILE.length)
      : (MAC_SOUNDS as readonly string[]).includes(name)
        ? `/System/Library/Sounds/${name}.aiff`
        : null
  if (path) await $.process.run(['afplay', path]).catch(() => undefined)
}
