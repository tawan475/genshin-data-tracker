import type { ArtifactIdentity } from './artifact'
import type { GoodSubstat } from './good'

/**
 * One artifact catalog row on the wire: positional to keep the response small
 * (an account's catalog is a few thousand rows).
 * [id, setKey, slotKey, level, rarity, mainStatKey, substats, totalRolls,
 *  elixerCrafted (0/1), unactivatedSubstats, cv, rv]
 */
export type CatalogRow = [
  number,
  string,
  string,
  number,
  number,
  string,
  GoodSubstat[],
  number,
  0 | 1,
  GoodSubstat[],
  number,
  number,
]

export interface CatalogEntry extends ArtifactIdentity {
  id: number
  cv: number
  rv: number
}

export function catalogFromRows(rows: readonly CatalogRow[]): Map<number, CatalogEntry> {
  const catalog = new Map<number, CatalogEntry>()
  for (const r of rows) {
    catalog.set(r[0], {
      id: r[0],
      setKey: r[1],
      slotKey: r[2],
      level: r[3],
      rarity: r[4],
      mainStatKey: r[5],
      substats: r[6],
      totalRolls: r[7],
      elixerCrafted: r[8] === 1,
      unactivatedSubstats: r[9],
      cv: r[10],
      rv: r[11],
    })
  }
  return catalog
}
