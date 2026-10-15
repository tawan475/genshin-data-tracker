/**
 * "Now" for live sync (docs/plans/live-sync.md §8.1): the newest snapshot
 * with its open journal applied. Pure; account-data.ts caches it.
 */

import {
  applyDelta,
  artifactIdentityText,
  bindItemGuids,
  type Good,
  type LiveArtifact,
  type LiveGood,
  type LiveJournalResponse,
} from '@gdt/shared'

/** What withJournal needs of an inventory (account-data's Inventory). */
export interface JournalTarget {
  good: Good
  artifactIds: number[]
  live?: LiveApplied
}

/** What a journal applied: its seq and time, and the material counts it set. */
export interface LiveApplied {
  seq: number
  updatedAt: number
  changes: number
  /** Material keys the journal set or removed (they supersede older hand edits). */
  materials: string[]
}

/**
 * The inventory with the journal applied. A journal that does not follow
 * this snapshot (a newer one is on its way, or it was deleted) is ignored.
 * Artifacts keep their catalog ids while their identity is unchanged.
 */
export function withJournal<T extends JournalTarget>(
  inventory: T,
  live: LiveJournalResponse,
  snapshotId: number,
): T {
  if (!live.open || live.base?.snapshotId !== snapshotId || !live.changes?.length) {
    return inventory
  }
  const bound = bindItemGuids(inventory.good as LiveGood, live.items ?? [])
  const idOf = new Map<LiveArtifact, number>()
  const byGuid = new Map<string, { id: number; identity: string }>()
  bound.artifacts.forEach((artifact, i) => {
    const id = inventory.artifactIds[i] ?? -1
    idOf.set(artifact, id)
    if (artifact.gi_guid) byGuid.set(artifact.gi_guid, { id, identity: identityOf(artifact) })
  })
  const now = applyDelta(bound, live.changes)
  const artifactIds = now.artifacts.map((artifact) => {
    const same = idOf.get(artifact)
    if (same !== undefined) return same
    const before = artifact.gi_guid ? byGuid.get(artifact.gi_guid) : undefined
    return before && before.identity === identityOf(artifact) ? before.id : -1
  })
  return {
    ...inventory,
    good: now as Good,
    artifactIds,
    live: {
      seq: live.seq ?? 0,
      updatedAt: live.updatedAt ?? 0,
      changes: live.changes.length,
      materials: [
        ...new Set(
          live.changes.flatMap(([, path]) =>
            path[0] === 'materials' && path.length === 2 ? [String(path[1])] : [],
          ),
        ),
      ],
    },
  }
}

function identityOf(a: LiveArtifact): string {
  return artifactIdentityText({
    setKey: a.setKey,
    slotKey: a.slotKey,
    level: a.level,
    rarity: a.rarity,
    mainStatKey: a.mainStatKey,
    substats: a.substats,
    totalRolls: a.totalRolls ?? 0,
    elixerCrafted: a.elixerCrafted ?? false,
    unactivatedSubstats: a.unactivatedSubstats ?? [],
  })
}
