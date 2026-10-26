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

export const SOUND_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'off', label: 'Off' },
  ...Object.entries(MOD_SOUNDS).map(([value, { label }]) => ({ value, label })),
  ...MAC_SOUNDS.map(name => ({ value: name, label: name })),
]

export const isSound = (value: unknown): value is string =>
  typeof value === 'string' && SOUND_OPTIONS.some(option => option.value === value)

// Plays a sound by its setting's value; off, unknown or unplayable stays silent.
// Every sound goes through afplay, the mod's own chimes included, so one path
// is known to work wherever the Open button does.
export async function playSound($: EngineInterface, name: string) {
  const mine = MOD_SOUNDS[name]
  const path = mine
    ? `${$.plugin.root}/${mine.asset}`
    : (MAC_SOUNDS as readonly string[]).includes(name)
      ? `/System/Library/Sounds/${name}.aiff`
      : null
  if (path) await $.process.run(['afplay', path]).catch(() => undefined)
}
