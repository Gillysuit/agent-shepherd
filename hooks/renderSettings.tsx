import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { HerdSettings } from '../types'
import { SOUND_OPTIONS, playSound } from './sounds'
import { DEFAULT_SETTINGS, RECENT_CHOICES, SETTINGS_KEY, STALE_CHOICES } from './state'

const settings = atom({ plugin: 'agent-shepherd', key: 'settings' } as const, DEFAULT_SETTINGS)
const view = atom({ plugin: 'agent-shepherd', key: 'view' } as const, 'list')

type Flag = 'openOnStart' | 'hideAgents' | 'collapseAgents' | 'hideIdle' | 'hideFinished'

const FLAGS: readonly (readonly [Flag, string])[] = [
  ['openOnStart', 'Open this pane in every new session'],
  ['hideAgents', 'Hide subagents'],
  ['collapseAgents', 'Start with subagents collapsed'],
  ['hideIdle', 'Hide idle sessions'],
  ['hideFinished', 'Hide finished subagents'],
]

const duration = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${Math.round(seconds / 3600)}h`

export async function renderSettings($: EngineInterface, e: RenderInput<'Pane'>) {
  const table = $.ui.resolve(e)
  const { Box, Button, Text } = table
  const Select = 'Select' in table ? table.Select : undefined
  const current = await read($, settings)

  // Every change is saved to the store, where every session's pane picks it up.
  const save = (next: HerdSettings) => {
    void update($, settings, () => next)
    void $.store.set(SETTINGS_KEY, next).catch(() => $.ui.toast('Could not save settings.'))
  }

  // A label with a dropdown; mobile draws no Select yet, so there a button
  // steps to the next option instead.
  const choiceRow = (
    key: string,
    label: string,
    options: readonly { value: string; label: string }[],
    value: string,
    choose: (value: string) => void,
    extra?: RenderChildren,
  ) => {
    const at = options.findIndex(option => option.value === value)
    const next = options[(at + 1) % options.length] ?? options[0]
    return (
      <Box key={key} flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Text>{label}</Text>
        <Box flexDirection="row" alignItems="center" gap={1}>
        {Select ? (
          <Select
            key={`setting-${key}`}
            value={value}
            options={options}
            onSelect={(picked: string) => choose(picked)}
          />
        ) : (
          <Button key={`setting-${key}`} onPress={() => next && choose(next.value)}>
            {options[at]?.label ?? value}
          </Button>
        )}
        {extra}
        </Box>
      </Box>
    )
  }
  const durations = (choices: readonly number[]) =>
    choices.map(seconds => ({ value: String(seconds), label: duration(seconds) }))

  // ▶ plays the chosen sound again, since picking the same one fires nothing.
  const playButton = (field: 'doneSound' | 'attentionSound') =>
    current[field] === 'off' ? undefined : (
      <Button key={`play-${field}`} onPress={() => void playSound($, current[field])}>
        ▶
      </Button>
    )

  // Picking a sound plays it, so the choice is heard, not guessed.
  // A toast confirms each pick, so a pick that never arrives is noticed.
  const pickSound = (field: 'doneSound' | 'attentionSound') => (name: string) => {
    save({ ...current, [field]: name })
    const label = SOUND_OPTIONS.find(option => option.value === name)?.label ?? name
    $.ui.toast(`${field === 'doneSound' ? 'Done' : 'Approval'} sound: ${label}`)
    void playSound($, name)
  }

  // Each row reads like a switch: its label, then an On or Off button.
  const toggleRow = (flag: Flag, label: string) => (
    <Box key={flag} flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
      <Text>{label}</Text>
      <Button
        key={`setting-${flag}`}
        variant={current[flag] ? 'primary' : 'secondary'}
        onPress={() => save({ ...current, [flag]: !current[flag] })}
      >
        {current[flag] ? 'On' : 'Off'}
      </Button>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Text weight="semibold">Settings</Text>
        <Button key="close-settings" onPress={() => void update($, view, () => 'list')}>
          Done
        </Button>
      </Box>
      <Box flexDirection="column" gap={1}>
        {FLAGS.map(([flag, label]) => toggleRow(flag, label))}
        {choiceRow('done-sound', 'Sound when a session is done', SOUND_OPTIONS, current.doneSound, pickSound('doneSound'), playButton('doneSound'))}
        {choiceRow('attention-sound', 'Sound when it needs approval', SOUND_OPTIONS, current.attentionSound, pickSound('attentionSound'), playButton('attentionSound'))}
        {choiceRow('stale', 'Drop quiet sessions after', durations(STALE_CHOICES), String(current.staleSeconds), value =>
          save({ ...current, staleSeconds: Number(value) }),
        )}
        {choiceRow('recent', 'Show sessions active within', durations(RECENT_CHOICES), String(current.recentMinutes * 60), value =>
          save({ ...current, recentMinutes: Number(value) / 60 }),
        )}
      </Box>
      <Text dimColor>Saved for every session.</Text>
    </Box>
  )
}
