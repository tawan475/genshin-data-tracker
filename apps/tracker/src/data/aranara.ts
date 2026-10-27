import type { GiAranaraState, GiCollections } from '@gdt/shared'

/**
 * The Aranara collection: the game data's entries (by `id`), each
 * with its captured state. The game data names none of them and the capture
 * keys them by type, then id; an id the game data lacks (newer than it) is
 * listed after. Pure.
 */
export interface AranaraEntry {
  id: number
  state: GiAranaraState
}

/** The wiki's guide to the Material-Collecting Aranara: where each one waits. */
export const ARANARA_GUIDE =
  'https://genshin-impact.fandom.com/wiki/Material-Collecting_Aranara#Location'

export function aranaraEntries(
  rows: readonly { id: number }[],
  captured: NonNullable<GiCollections['aranara']>,
): AranaraEntry[] {
  const states = new Map<number, GiAranaraState>()
  for (const entries of Object.values(captured)) {
    for (const [id, state] of Object.entries(entries)) states.set(Number(id), state)
  }
  const known = new Set(rows.map((row) => row.id))
  return [
    ...[...known].sort((a, b) => a - b).map((id) => ({ id, state: states.get(id) ?? 'none' })),
    ...[...states.keys()]
      .filter((id) => !known.has(id))
      .sort((a, b) => a - b)
      .map((id) => ({ id, state: states.get(id)! })),
  ]
}
