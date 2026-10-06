/**
 * Which copy of a weapon in the capture each weapon goal starts from, pure.
 * GOOD weapons have no id, so a goal finds its copy the way
 * `findWeaponState` does for one goal: the copy its character holds, else
 * the best spare one, else the best copy anywhere (it moved), else a new
 * one (level 1, R1, not owned). With several goals of one weapon (copies
 * planned on purpose), no copy goes to two goals: holders first, then
 * spares, each round in goal order; a goal left over starts new rather than
 * borrow a copy another character holds.
 */

import { NEW_WEAPON, type OwnedWeapon, type WeaponState } from '@gdt/game-data/planner-math'

export interface WeaponCopy {
  state: WeaponState
  owned: boolean
}

const better = (a: OwnedWeapon, b: OwnedWeapon) =>
  b.level - a.level || b.ascension - a.ascension || b.refinement - a.refinement

/** Copies for `goals` (in their order: the first goals of a weapon choose first), by goal id. */
export function assignWeaponCopies(
  weapons: readonly OwnedWeapon[],
  goals: readonly { id: string; key: string; owner: string }[],
): Map<string, WeaponCopy> {
  const result = new Map<string, WeaponCopy>()
  const byKey = new Map<string, { id: string; owner: string }[]>()
  for (const g of goals) {
    const list = byKey.get(g.key)
    if (list) list.push(g)
    else byKey.set(g.key, [g])
  }
  for (const [key, list] of byKey) {
    const copies = weapons.filter((w) => w.key === key).sort(better)
    const free = new Set(copies)
    const give = (id: string, copy: OwnedWeapon | undefined) => {
      if (!copy) return
      free.delete(copy)
      result.set(id, {
        state: { level: copy.level, ascension: copy.ascension, refinement: copy.refinement },
        owned: true,
      })
    }
    const waiting = () => list.filter((g) => !result.has(g.id))
    for (const g of waiting()) {
      if (g.owner)
        give(
          g.id,
          copies.find((w) => free.has(w) && w.location === g.owner),
        )
    }
    for (const g of waiting())
      give(
        g.id,
        copies.find((w) => free.has(w) && !w.location),
      )
    // The one goal of a weapon follows its copy to whoever holds it now.
    if (list.length === 1)
      for (const g of waiting())
        give(
          g.id,
          copies.find((w) => free.has(w)),
        )
    for (const g of waiting()) result.set(g.id, { state: { ...NEW_WEAPON }, owned: false })
  }
  return result
}
