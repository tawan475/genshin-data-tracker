import { entryIcon, entryId } from '@gdt/game-data'

/**
 * Radiant Spincrystals (the Serenitea Pot's music list): every one the game
 * data knows, and which of them the newest capture's `gi_collections` has.
 * Pure, apart from the lazy loader.
 */

/** The game's icon of every Radiant Spincrystal, and of nothing else in the material index. */
export const SPINCRYSTAL_ICON = 'UI_ItemIcon_BGM_Common'

type MaterialIndexEntry = Parameters<typeof entryId>[0]

export interface Spincrystal {
  /** Item id (141001 = "Radiant Spincrystal 1"). */
  id: number
  /** GOOD material key (`RadiantSpincrystal1`): its name comes from the material names. */
  key: string
  /** N of "Radiant Spincrystal N"; null for the ones named after a song. */
  number: number | null
}

const NUMBERED = /^RadiantSpincrystal(\d+)$/

/** The material index's Radiant Spincrystals (by their icon), by item id. */
export function spincrystalsOf(
  materials: Readonly<Record<string, number | readonly (number | string)[]>>,
): Spincrystal[] {
  const out: Spincrystal[] = []
  for (const [key, value] of Object.entries(materials)) {
    const entry = value as MaterialIndexEntry
    if (entryIcon(entry) !== SPINCRYSTAL_ICON) continue
    const n = NUMBERED.exec(key)
    out.push({ id: entryId(entry), key, number: n ? Number(n[1]) : null })
  }
  return out.sort((a, b) => a.id - b.id)
}

let loading: Promise<Spincrystal[]> | null = null

/** Every Radiant Spincrystal, from materials.json (the chunk the material index loads too). */
export function loadSpincrystals(): Promise<Spincrystal[]> {
  loading ??= import('@gdt/game-data/data/materials.json').then(
    (file) => spincrystalsOf(file.default.materials),
    (error: unknown) => {
      loading = null
      throw error
    },
  )
  return loading
}

export interface SpincrystalRow extends Spincrystal {
  have: boolean
}

export interface SpincrystalProgress {
  /** Every one the game data knows, by item id: numbered first, then the song-named ones. */
  numbered: SpincrystalRow[]
  named: SpincrystalRow[]
  have: number
  total: number
  /** Captured ids the game data does not know yet (newer than it). */
  unknown: number[]
}

/** Which of `all` the capture's list `owned` has. */
export function spincrystalProgress(
  all: readonly Spincrystal[],
  owned: readonly number[],
): SpincrystalProgress {
  const held = new Set(owned)
  const rows = all.map((s) => ({ ...s, have: held.has(s.id) }))
  const known = new Set(all.map((s) => s.id))
  return {
    numbered: rows.filter((r) => r.number !== null).sort((a, b) => a.number! - b.number!),
    named: rows.filter((r) => r.number === null),
    have: rows.filter((r) => r.have).length,
    total: rows.length,
    unknown: owned.filter((id) => !known.has(id)),
  }
}

export type SpincrystalFilter = 'all' | 'missing' | 'have'

export function filterSpincrystals(
  rows: readonly SpincrystalRow[],
  filter: SpincrystalFilter,
): SpincrystalRow[] {
  return filter === 'all' ? [...rows] : rows.filter((r) => r.have === (filter === 'have'))
}

const WIKI = 'https://genshin-impact.fandom.com/wiki/'

/**
 * A Spincrystal's guide on the Genshin Impact Fandom wiki (where it is
 * found): the numbered ones by page title (`Radiant_Spincrystal_55`), the
 * song-named ones by a search for their English name.
 */
export function spincrystalGuide(row: Pick<Spincrystal, 'number'>, englishName: string): string {
  return row.number !== null
    ? `${WIKI}Radiant_Spincrystal_${row.number}`
    : `${WIKI}Special:Search?query=${encodeURIComponent(englishName)}`
}
