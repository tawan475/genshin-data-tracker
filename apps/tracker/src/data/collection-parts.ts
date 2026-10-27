import {
  decodeCollections,
  decodeExploration,
  decodeProgress,
  decodeTasks,
  decodeWardrobe,
  type BundleSnapshot,
  type CollectionsSection,
  type TasksSection,
  type ExplorationSection,
  type GiEvent,
  type ProgressSection,
  type GiCollections,
  type GiExploration,
  type GiTasks,
  type GiWardrobe,
  type WardrobeSection,
} from '@gdt/shared'

/**
 * What the captures say the player has collected: each part of
 * `gi_collections` (sections `collections` + `collections2`) and
 * `gi_wardrobe` and `gi_exploration` from the newest snapshot that has that part, with that
 * snapshot's time. A part no capture had is absent (absent is not "none").
 */

export interface Captured<T> {
  value: T
  /** The snapshot's capture time (epoch ms). */
  takenAt: number
}

type Parts = Required<GiCollections> & {
  wardrobe: GiWardrobe
  exploration: GiExploration
  /** gi_tasks' respawn times (Capture 1.7.0), shown on the World page. */
  respawns: NonNullable<GiTasks['respawns']>
  /** gi_events (Capture 1.7.0), by activity id. */
  events: Record<string, GiEvent>
}
export type CapturedCollections = { [K in keyof Parts]?: Captured<Parts[K]> }

export const COLLECTION_SECTIONS = [
  'collections',
  'collections2',
  'wardrobe',
  'exploration',
  'tasks',
  'progress',
] as const

/** A decoded bundle's snapshots (oldest first) and section texts (see account-data). */
export interface CollectionsBundle {
  snapshots: readonly BundleSnapshot[]
  texts: ReadonlyMap<string, string>
}

/** Pure: the newest value of every part across a bundle. */
export function capturedCollections(bundle: CollectionsBundle): CapturedCollections {
  const out: CapturedCollections = {}
  const put = <K extends keyof Parts>(key: K, value: Parts[K] | undefined, takenAt: number) => {
    if (value !== undefined && !out[key]) out[key] = { value, takenAt } as CapturedCollections[K]
  }
  for (const snapshot of [...bundle.snapshots].reverse()) {
    for (const key of [snapshot.collections, snapshot.collections2]) {
      const text = key ? bundle.texts.get(key) : undefined
      if (text === undefined) continue
      const parts = decodeCollections(JSON.parse(text) as CollectionsSection)
      for (const [part, value] of Object.entries(parts)) {
        put(part as keyof GiCollections, value as never, snapshot.takenAt)
      }
    }
    const wardrobe = snapshot.wardrobe ? bundle.texts.get(snapshot.wardrobe) : undefined
    if (wardrobe !== undefined) {
      put('wardrobe', decodeWardrobe(JSON.parse(wardrobe) as WardrobeSection), snapshot.takenAt)
    }
    const exploration = snapshot.exploration ? bundle.texts.get(snapshot.exploration) : undefined
    if (exploration !== undefined) {
      const value = decodeExploration(JSON.parse(exploration) as ExplorationSection)
      put('exploration', value, snapshot.takenAt)
    }
    const tasks = snapshot.tasks ? bundle.texts.get(snapshot.tasks) : undefined
    if (tasks !== undefined) {
      put('respawns', decodeTasks(JSON.parse(tasks) as TasksSection).respawns, snapshot.takenAt)
    }
    const progress = snapshot.progress ? bundle.texts.get(snapshot.progress) : undefined
    if (progress !== undefined) {
      put(
        'events',
        decodeProgress(JSON.parse(progress) as ProgressSection).events,
        snapshot.takenAt,
      )
    }
  }
  return out
}
