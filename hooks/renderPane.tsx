import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, RenderInput } from 'claude-code'

import type { AgentRow, SessionBeat } from '../types'
import { AGENT_MARK, LEGEND, ORDER, SESSION_MARK } from './colors'
import { renderSettings } from './renderSettings'
import { DEFAULT_SETTINGS, elapsed, isActive } from './state'

const agents = atom({ plugin: 'agent-shepherd', key: 'agents' } as const, [])
const sessions = atom({ plugin: 'agent-shepherd', key: 'sessions' } as const, [])
const now = atom({ plugin: 'agent-shepherd', key: 'now' } as const, 0)
const agentsOpen = atom({ plugin: 'agent-shepherd', key: 'agentsOpen' } as const, null)
const settings = atom({ plugin: 'agent-shepherd', key: 'settings' } as const, DEFAULT_SETTINGS)
const view = atom({ plugin: 'agent-shepherd', key: 'view' } as const, 'list')

// This session's card: a fill a step above the pane, a quiet outline, and a
// lavender chip, a hue no state uses.
const MINE_FILL = '#24242b'
const MINE_BORDER = '#45475a'
const MINE_CHIP = '#363548'
const MINE_LABEL = '#cba6f7'

// The props for a state's second line: its own color, or dim when at rest.
const tint = (isResting: boolean, color: Color) =>
  isResting ? { dimColor: true } : { color }

const count = <S extends string>(list: { status: S }[], statuses: readonly S[]) =>
  statuses
    .map(status => [status, list.filter(r => r.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`)
    .join(' · ')

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>) {
  if ((await read($, view)) === 'settings') return renderSettings($, e)
  const { Box, Button, Text } = $.ui.resolve(e)
  const [list, live, at, myId, openChoice, prefs] = await Promise.all([
    read($, agents),
    read($, sessions),
    read($, now),
    $.session.id(),
    read($, agentsOpen),
    read($, settings),
  ])
  const isOpen = openChoice ?? !prefs.collapseAgents
  // Compact steps the text down a size and drops the gaps between rows.
  const gap = prefs.compact ? 0 : 1
  const title = prefs.compact ? ({ size: 'footnote' } as const) : {}
  const meta = prefs.compact ? ({ size: 'caption' } as const) : {}
  const shownSessions = live
    .filter(row => !prefs.hideIdle || row.status !== 'idle' || row.id === myId)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.since - a.since)
    .slice(0, 12)
  const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 9 - shownSessions.length * 2) / (2 + gap)))
  const shownAgents = list
    .filter(row => !prefs.hideFinished || isActive(row))
    .reverse()
    .slice(0, room)

  // The dot carries the state; the title stays readable in the text color.
  // Open jumps the desktop app to that session through its deep link.
  const sessionRow = (row: SessionBeat) => {
    const hostId = row.hostId
    const canOpen = Boolean(hostId) && row.id !== myId
    const isMine = row.id === myId
    // This session's row is a card, as herdr marks its selected row: a lifted
    // fill, a quiet outline and a small chip where Open would sit. Every row
    // keeps the same inner padding so the titles line up.
    return (
      <Box
        key={row.id}
        flexDirection="column"
        paddingX={1}
        {...(isMine
          ? { borderStyle: 'round', borderColor: MINE_BORDER, backgroundColor: MINE_FILL }
          : {})}
      >
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box flexDirection="row" gap={1} flexShrink={1}>
            <Text color={SESSION_MARK[row.status].color}>{SESSION_MARK[row.status].glyph}</Text>
            <Text weight="semibold" {...title}>{row.title || 'Untitled session'}</Text>
          </Box>
          {canOpen && (
            <Button
              key={`open-${row.id}`}
              onPress={() =>
                void $.process
                  .run(['open', `claude://claude.ai/epitaxy/${hostId}`])
                  .catch(() => $.ui.toast('Could not open that session.'))
              }
            >
              <Text {...meta}>Open</Text>
            </Button>
          )}
          {isMine && (
            <Box backgroundColor={MINE_CHIP} paddingX={1}>
              <Text color={MINE_LABEL} size="caption" weight="semibold">
                CURRENT
              </Text>
            </Box>
          )}
        </Box>
        <Text {...tint(row.status === 'idle', SESSION_MARK[row.status].color)} {...meta}>
          {[
            `${row.status} ${elapsed(Math.max(at, row.since) - row.since)}`,
            row.project,
            row.agentsActive > 0
              ? `${row.agentsActive} agent${row.agentsActive === 1 ? '' : 's'}`
              : null,
            !hostId ? 'restart it to enable Open' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Box>
    )
  }

  const agentRow = (row: AgentRow) => (
    <Box key={row.id} flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={AGENT_MARK[row.status].color}>{AGENT_MARK[row.status].glyph}</Text>
          <Text weight="semibold" {...title}>{row.description}</Text>
        </Box>
        <Text dimColor tabular {...meta}>
          {elapsed((row.endedAt ?? Math.max(at, row.startedAt)) - row.startedAt)}
        </Text>
      </Box>
      <Text {...tint(row.status === 'stopped', AGENT_MARK[row.status].color)} {...meta}>
        {[
          row.status,
          row.type,
          row.isBackground ? 'bg' : null,
          `${row.tools} tools`,
          isActive(row) && row.lastTool ? row.lastTool : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Box>
  )

  const legend = (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {LEGEND.filter(([, , forAgents]) => !(forAgents && prefs.hideAgents)).map(
          ([mark, label]) => (
          <Box key={label} flexDirection="row" gap={1}>
            <Text color={mark.color}>{mark.glyph}</Text>
            <Text dimColor {...meta}>{label}</Text>
          </Box>
          ),
        )}
      </Box>
    </Box>
  )

  // The legend sits at the bottom: the tree is at least as tall as the rows the
  // pane gives its body, which on the desktop measured true to the pixel. A
  // percent resolved against no height there.
  return (
    <Box flexDirection="column" gap={1} flexGrow={1} minHeight={e.props.scroll.bodyRows}>
      <Box flexDirection="column" gap={gap} flexGrow={1}>
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Text weight="semibold">Sessions</Text>
            <Button key="open-settings" onPress={() => void update($, view, () => 'settings')}>
              ⚙
            </Button>
          </Box>
          <Text dimColor {...meta}>
            {live.length === 0
              ? 'No live sessions yet.'
              : count(live, ['blocked', 'done', 'working', 'idle'] as const)}
          </Text>
        </Box>
        {shownSessions.map(sessionRow)}
        {!prefs.hideAgents && (
          <>
            <Box flexDirection="column">
              <Button
                key="toggle-agents"
                onPress={() => void update($, agentsOpen, () => !isOpen)}
              >
                <Text weight="semibold">{isOpen ? '▾' : '▸'} Subagents</Text>
              </Button>
              <Text dimColor {...meta}>
                {list.length === 0
                  ? 'No subagents yet.'
                  : count(list, ['working', 'blocked', 'done', 'failed'] as const)}
              </Text>
            </Box>
            {isOpen && shownAgents.map(agentRow)}
          </>
        )}
      </Box>
      {legend}
    </Box>
  )
}
