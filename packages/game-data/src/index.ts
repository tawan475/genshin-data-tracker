/**
 * Game data for the tracker, compiled from the game's own tables by
 * scripts/build.ts (see README.md). Each loader dynamic-imports its JSON, so
 * Vite emits every file as its own chunk that loads only when a page needs
 * it; loaders cache their result and can be called freely.
 */

import meta from '../data/meta.json'
import type {
  AchievementsFile,
  Element,
  GoalsFile,
  IconsFile,
  MaterialIndexFile,
  MaterialKind,
  MetaFile,
  PlannerFile,
  TextFile,
  WeaponType,
} from './format'
import { entryIcon, entryId } from './icons'

export type { Element, MaterialKind, MetaFile, WeaponType } from './format'
export { entryIcon, entryId } from './icons'

/** Game version and dump commit the data was compiled from. */
export const GAME_DATA: MetaFile = meta

/** Caches a loader's promise; a failed load is forgotten so the next call retries. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () =>
    (promise ??= load().catch((error: unknown) => {
      promise = undefined
      throw error
    }))
}

// --- Achievements -----------------------------------------------------------

export interface Achievement {
  id: number
  /** Category (goal) id; 0 is "Wonders of the World". */
  goal: number
  /** Position within the category. */
  order: number
  hidden: boolean
  /** The previous tier of a multi-tier achievement, or 0. */
  prevStage: number
  primogems: number
  /** Target count (e.g. 40 for "open 40 chests"). */
  progress: number
  /** Version it was added in ("4.2"); "" for disused ones nobody could earn. */
  version: string
  /** Removed from the game: kept so stored ids resolve, but never counted. */
  disused: boolean
}

export interface AchievementGoal {
  id: number
  order: number
  /** Icon name; self-hosted at /gi/<icon>.webp. */
  icon: string
}

export interface AchievementData {
  /** Every achievement, disused ones included, by id. */
  achievements: Achievement[]
  byId: ReadonlyMap<number, Achievement>
  /** Categories in game order. */
  goals: AchievementGoal[]
  goalById: ReadonlyMap<number, AchievementGoal>
}

export const loadAchievements = once(async (): Promise<AchievementData> => {
  const [a, g] = await Promise.all([
    import('../data/achievements.json'),
    import('../data/achievement-goals.json'),
  ])
  const file = a.default as unknown as AchievementsFile
  const goalsFile = g.default as unknown as GoalsFile
  const achievements = file.rows.map(
    ([id, goal, order, hidden, prevStage, primogems, progress, version, disused]): Achievement => ({
      id,
      goal,
      order,
      hidden: hidden === 1,
      prevStage,
      primogems,
      progress,
      version,
      disused: disused === 1,
    }),
  )
  const goals = goalsFile.rows
    .map(([id, order, icon]): AchievementGoal => ({ id, order, icon }))
    .sort((x, y) => x.order - y.order)
  return {
    achievements,
    byId: new Map(achievements.map((x) => [x.id, x])),
    goals,
    goalById: new Map(goals.map((x) => [x.id, x])),
  }
})

export type Language = 'en'

export interface AchievementText {
  title: string
  description: string
}

export interface AchievementTexts {
  achievements: ReadonlyMap<number, AchievementText>
  goals: ReadonlyMap<number, string>
}

const textFiles: Record<Language, () => Promise<{ default: unknown }>> = {
  en: () => import('../data/text/en.json'),
}
const textLoaders = Object.fromEntries(
  Object.entries(textFiles).map(([lang, load]) => [
    lang,
    once(async (): Promise<AchievementTexts> => {
      const file = (await load()).default as TextFile
      return {
        achievements: new Map(
          Object.entries(file.achievements).map(([id, [title, description]]) => [
            Number(id),
            { title, description },
          ]),
        ),
        goals: new Map(Object.entries(file.goals).map(([id, name]) => [Number(id), name])),
      }
    }),
  ]),
) as Record<Language, () => Promise<AchievementTexts>>

/** Achievement titles/descriptions and category names. */
export function achievementText(lang: Language = 'en'): Promise<AchievementTexts> {
  return textLoaders[lang]()
}

// --- Planner ----------------------------------------------------------------

export interface PlannerMaterial {
  id: number
  /** GOOD key, as in inventories. */
  key: string
  name: string
  rarity: number
  kind: MaterialKind
  /** Game icon name. */
  icon: string
  family: MaterialFamily | null
  /** 1-based position in its family; 0 without one. */
  tier: number
}

export interface MaterialFamily {
  /** GOOD key of the lowest tier. */
  key: string
  kind: MaterialKind
  /** Lowest tier first. */
  members: PlannerMaterial[]
  /** craftMora[i]: mora to craft one of members[i+1] from three of members[i]; empty when it cannot be crafted. */
  craftMora: number[]
  /** Domain name, for talent books and weapon materials. */
  domain: string
  /** Days the domain drops it (0 = Sunday, as Date#getDay); empty when not from a domain. */
  weekdays: number[]
}

export interface ItemCost {
  material: PlannerMaterial
  count: number
}

export interface AscensionPhase {
  /** Level cap once this phase is reached. */
  cap: number
  mora: number
  items: ItemCost[]
}

export interface TalentLevel {
  mora: number
  items: ItemCost[]
}

export interface PlannerCharacter {
  key: string
  id: number
  rarity: number
  /** null for characters that switch element (Manekin, Manekina). */
  element: Element | null
  weapon: WeaponType
  /** ascension[P]: reaching phase P (index 0 is the start: cap 20, free). */
  ascension: AscensionPhase[]
  /** talents.x[L-1]: reaching level L (index 0 is level 1, free). */
  talents: { normal: TalentLevel[]; skill: TalentLevel[]; burst: TalentLevel[] }
}

export interface PlannerWeapon {
  key: string
  id: number
  rarity: number
  type: WeaponType
  ascension: AscensionPhase[]
  /** Cap of the last ascension phase (70 for 1-2 star weapons, else 90). */
  maxLevel: number
}

export interface ExpItem {
  material: PlannerMaterial
  exp: number
}

export interface PlannerData {
  /** Highest level targets go to (levels 95/100 are not in the data yet). */
  levelCap: number
  mora: PlannerMaterial
  /** Mora spent per EXP point when levelling. */
  moraPerExp: { character: number; weapon: number }
  /** characterExp[L-1]: EXP from level L to L+1. */
  characterExp: readonly number[]
  /** weaponExp[rarity-1][L-1]: EXP from level L to L+1. */
  weaponExp: readonly (readonly number[])[]
  /** EXP books and enhancement ores, smallest first. */
  expItems: { character: ExpItem[]; weapon: ExpItem[] }
  materials: ReadonlyMap<number, PlannerMaterial>
  materialsByKey: ReadonlyMap<string, PlannerMaterial>
  families: MaterialFamily[]
  characters: ReadonlyMap<string, PlannerCharacter>
  weapons: ReadonlyMap<string, PlannerWeapon>
}

export const loadPlanner = once(async (): Promise<PlannerData> => {
  const file = (await import('../data/planner.json')).default as unknown as PlannerFile
  return decodePlanner(file)
})

/** Exported for tests; the app uses loadPlanner. */
export function decodePlanner(file: PlannerFile): PlannerData {
  const materials = new Map<number, PlannerMaterial>()
  for (const [id, key, name, rarity, kind, icon] of file.materials) {
    materials.set(id, { id, key, name, rarity, kind, icon, family: null, tier: 0 })
  }
  const material = (id: number): PlannerMaterial => {
    const found = materials.get(id)
    if (!found) throw new Error(`planner.json: unknown material ${id}`)
    return found
  }
  const families = file.families.map(([key, kind, members, craftMora, domain, weekdays]) => {
    const family: MaterialFamily = { key, kind, members: [], craftMora, domain, weekdays }
    members.forEach((id, index) => {
      const m = material(id)
      m.family = family
      m.tier = index + 1
      family.members.push(m)
    })
    return family
  })
  const items = (costs: [number, number][]) =>
    costs.map(([id, count]): ItemCost => ({ material: material(id), count }))
  const ascensions = new Map(
    Object.entries(file.ascensions).map(([key, phases]) => [
      key,
      phases.map(([cap, mora, costs]): AscensionPhase => ({ cap, mora, items: items(costs) })),
    ]),
  )
  const talents = new Map(
    Object.entries(file.talents).map(([key, levels]) => [
      key,
      levels.map(([mora, costs]): TalentLevel => ({ mora, items: items(costs) })),
    ]),
  )
  const table = <T>(tables: Map<string, T>, key: string): T => {
    const found = tables.get(key)
    if (!found) throw new Error(`planner.json: unknown table ${key}`)
    return found
  }

  const characters = new Map<string, PlannerCharacter>()
  for (const [key, id, rarity, element, weapon, asc, normal, skill, burst] of file.characters) {
    characters.set(key, {
      key,
      id,
      rarity,
      element: element || null,
      weapon,
      ascension: table(ascensions, asc),
      talents: {
        normal: table(talents, normal),
        skill: table(talents, skill),
        burst: table(talents, burst),
      },
    })
  }
  const weapons = new Map<string, PlannerWeapon>()
  for (const [key, id, rarity, type, asc] of file.weapons) {
    const ascension = table(ascensions, asc)
    weapons.set(key, { key, id, rarity, type, ascension, maxLevel: ascension.at(-1)?.cap ?? 0 })
  }
  const expItems = (list: [number, number][]) =>
    list.map(([id, exp]): ExpItem => ({ material: material(id), exp }))

  return {
    levelCap: file.levelCap,
    mora: material(file.mora),
    moraPerExp: file.moraPerExp,
    characterExp: file.characterExp,
    weaponExp: file.weaponExp,
    expItems: {
      character: expItems(file.expItems.character),
      weapon: expItems(file.expItems.weapon),
    },
    materials,
    materialsByKey: new Map([...materials.values()].map((m) => [m.key, m])),
    families,
    characters,
    weapons,
  }
}

// --- Material index and self-hosted icons -----------------------------------

export interface MaterialIndex {
  /** Every GOOD material key the index knows. */
  readonly size: number
  has(key: string): boolean
  /** Item id: the game numbers items in blocks by kind, so it sorts and groups the bag. */
  id(key: string): number | undefined
  /** Game icon name (`UI_ItemIcon_104013`). */
  icon(key: string): string | undefined
}

export const loadMaterialIndex = once(async (): Promise<MaterialIndex> => {
  const file = (await import('../data/materials.json')).default as unknown as MaterialIndexFile
  const entries = file.materials
  const entry = (key: string) => (Object.hasOwn(entries, key) ? entries[key] : undefined)
  return {
    size: Object.keys(entries).length,
    has: (key) => entry(key) !== undefined,
    id: (key) => {
      const e = entry(key)
      return e === undefined ? undefined : entryId(e)
    },
    icon: (key) => {
      const e = entry(key)
      return e === undefined ? undefined : entryIcon(e)
    },
  }
})

export interface IconManifest {
  /** Icon names self-hosted at `/gi/<name>.webp` (apps/tracker/public/gi). */
  hosted: ReadonlySet<string>
  /** Icons no source had when `icons` last ran (Enka included): show a placeholder. */
  missing: ReadonlySet<string>
}

export const loadIconManifest = once(async (): Promise<IconManifest> => {
  const file = (await import('../data/icons.json')).default as unknown as IconsFile
  return { hosted: new Set(Object.values(file.sources).flat()), missing: new Set(file.missing) }
})
