/**
 * Game data for the tracker, compiled from the game's own tables by
 * scripts/build.ts (see README.md). Each loader dynamic-imports its JSON, so
 * Vite emits every file as its own chunk that loads only when a page needs
 * it; loaders cache their result and can be called freely.
 */

import meta from '../data/meta.json'
import type {
  AchievementsFile,
  DomainKind,
  Element,
  GoalsFile,
  MaterialIndexFile,
  MissingImagesFile,
  MaterialKind,
  MetaFile,
  PlannerFile,
  TalentSlot,
  TextFile,
  WeaponType,
} from './format'
import { entryIcon, entryId } from './icons'
import type { ImageCoverage } from './image-url'

export type { ImageCoverage } from './image-url'
export type { DomainKind, Element, MaterialKind, MetaFile, TalentSlot, WeaponType } from './format'
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
  /** Icon name (`UI_AchievementIcon_A001`). */
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
  /** Adventure Rank this phase needs (0: none). */
  ar: number
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
  /** The talent (GOOD name) constellations 3 and 5 raise by 3; null when none (Aloy, Manekin). */
  constellation: { c3: TalentSlot | null; c5: TalentSlot | null }
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

export interface DomainTier {
  /** 1 = I. */
  tier: number
  /** Adventure Rank to enter. */
  ar: number
  /** Original Resin per run. */
  resin: number
  /** Mora per run. */
  mora: number
  /** The game's preview of the lowest-tier material per run (first roll only; 0 when none). */
  preview: number
}

/** A talent book or weapon material domain entrance. */
export interface DomainEntry {
  /** DungeonEntry id. */
  entry: number
  kind: DomainKind
  /** Entrance name ("Forsaken Rift"); '' when overrides/planner.json has none. */
  name: string
  /** In the game's day order: Mon/Thu, Tue/Fri, Wed/Sat (each family's `weekdays` says the days). */
  families: MaterialFamily[]
  /** Lowest first; higher tiers drop more and need a higher Adventure Rank. */
  tiers: DomainTier[]
}

/** A weekly boss and its three materials (Dream Solvent converts any into another). */
export interface WeeklyBoss {
  /** GOOD key of its lowest-id material: a stable id. */
  key: string
  name: string
  items: PlannerMaterial[]
  /** Dream Solvent per conversion. */
  solvent: number
  /** Boss levels that drop the materials and the Adventure Rank each needs; empty outside domains (Andrius). */
  tiers: { ar: number; level: number }[]
}

export interface ForgeRecipe {
  /** GOOD key of the ore made. */
  ore: string
  /** GOOD key of the one input. */
  input: string
  /** Inputs per ore. */
  count: number
  mora: number
  seconds: number
}

export interface AscensionMoraPassive {
  character: string
  types: WeaponType[]
  /** Share of the weapon ascension Mora saved (0.5). */
  saved: number
}

export interface CraftingPassive {
  character: string
  /** Family kind it applies to when crafting. */
  kind: MaterialKind
  /** `double`: a chance of one more product; `refund`: a chance to get `share` of the inputs back. */
  effect: 'double' | 'refund'
  chance: number
  share: number
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

  /** talentAscension[L-1]: the ascension phase talent level L needs. */
  talentAscension: readonly number[]
  /** Talent book and weapon material domains, by entry id order. */
  domains: DomainEntry[]
  /** Family key -> its domain entrance. */
  domainOf: ReadonlyMap<string, DomainEntry>
  weeklyBosses: WeeklyBoss[]
  /** Weekly material key -> its boss. */
  weeklyBossOf: ReadonlyMap<string, WeeklyBoss>
  /** Weekly materials no boss drops and no Dream Solvent makes (quest rewards). */
  unfarmable: ReadonlySet<string>
  /** Billet trios Dream Solvent converts (item ids; not planner materials). */
  billets: { items: readonly number[]; solvent: number }[]
  /** GOOD keys of the conversion currencies. */
  items: { dreamSolvent: string; dustOfAzoth: string }
  /** Dust of Azoth per converted gem by tier (lowest first), and the gem families that convert. */
  azoth: { dust: readonly number[]; families: ReadonlySet<string> }
  /** Weapon EXP ore recipes (one input each). */
  forge: ForgeRecipe[]
  /**
   * Weapon EXP a weapon gives when used as enhancement material, by rarity
   * (index rarity-1), before its own levels.
   */
  weaponBaseExp: readonly number[]
  resin: {
    /** GOOD key of Original Resin. */
    original: string
    /** Items that hold resin: GOOD key and resin each (Fragile, Transient, Condensed). */
    items: { key: string; resin: number }[]
    /** Condensed Resin: GOOD key and most held. */
    condensed: { key: string; max: number }
    /** Original Resin per Ley Line Outcrop. */
    leyLine: number
  }
  passives: { ascensionMora: AscensionMoraPassive[]; crafting: CraftingPassive[] }
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
  const promoteAR = file.promoteAR ?? { character: [], weapon: [] }
  const ascensions = new Map(
    Object.entries(file.ascensions).map(([key, phases]) => {
      const ar = key.startsWith('w') ? promoteAR.weapon : promoteAR.character
      return [
        key,
        phases.map(
          ([cap, mora, costs], phase): AscensionPhase => ({
            cap,
            mora,
            items: items(costs),
            ar: ar[phase] ?? 0,
          }),
        ),
      ]
    }),
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
  for (const [
    key,
    id,
    rarity,
    element,
    weapon,
    asc,
    normal,
    skill,
    burst,
    c3,
    c5,
  ] of file.characters) {
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
      constellation: { c3: c3 || null, c5: c5 || null },
    })
  }
  const weapons = new Map<string, PlannerWeapon>()
  for (const [key, id, rarity, type, asc] of file.weapons) {
    const ascension = table(ascensions, asc)
    weapons.set(key, { key, id, rarity, type, ascension, maxLevel: ascension.at(-1)?.cap ?? 0 })
  }
  const expItems = (list: [number, number][]) =>
    list.map(([id, exp]): ExpItem => ({ material: material(id), exp }))

  const familyByKey = new Map(families.map((f) => [f.key, f]))
  const domains = (file.domains ?? []).map(
    ([entry, kind, name, keys, tiers]): DomainEntry => ({
      entry,
      kind,
      name,
      families: keys.map((key) => {
        const family = familyByKey.get(key)
        if (!family) throw new Error(`planner.json: domain ${entry} names unknown family ${key}`)
        return family
      }),
      tiers: tiers.map(([ar, resin, mora, preview], i) => ({
        tier: i + 1,
        ar,
        resin,
        mora,
        preview,
      })),
    }),
  )
  const weeklyBosses = (file.weeklyBosses ?? []).map(
    ([ids, solvent, name, tiers]): WeeklyBoss => ({
      key: material(ids[0]!).key,
      name,
      items: ids.map(material),
      solvent,
      tiers: tiers.map(([ar, level]) => ({ ar, level })),
    }),
  )
  const resin = file.resin ?? { original: '', items: [], condensed: ['', 0], leyLine: 0 }
  const passives = file.passives ?? { ascensionMora: [], crafting: [] }

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
    talentAscension: file.talentAscension ?? [],
    domains,
    domainOf: new Map(domains.flatMap((d) => d.families.map((f) => [f.key, d] as const))),
    weeklyBosses,
    weeklyBossOf: new Map(weeklyBosses.flatMap((b) => b.items.map((m) => [m.key, b] as const))),
    unfarmable: new Set(file.unfarmable ?? []),
    billets: (file.billets ?? []).map(([ids, solvent]) => ({ items: ids, solvent })),
    items: file.items ?? { dreamSolvent: '', dustOfAzoth: '' },
    azoth: { dust: file.azoth?.dust ?? [], families: new Set(file.azoth?.families ?? []) },
    forge: (file.forge ?? []).map(([ore, input, count, mora, seconds]) => ({
      ore,
      input,
      count,
      mora,
      seconds,
    })),
    weaponBaseExp: file.weaponBaseExp ?? [],
    resin: {
      original: resin.original,
      items: resin.items.map(([key, amount]) => ({ key, resin: amount })),
      condensed: { key: resin.condensed[0], max: resin.condensed[1] },
      leyLine: resin.leyLine,
    },
    passives: {
      ascensionMora: passives.ascensionMora.map(([character, types, saved]) => ({
        character,
        types,
        saved,
      })),
      crafting: passives.crafting.map(([character, kind, effect, chance, share]) => ({
        character,
        kind,
        effect,
        chance,
        share,
      })),
    },
  }
}

// --- Material index and image coverage ----------------------------------------

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

/**
 * What `pnpm --filter @gdt/game-data images` found at its last check
 * (data/missing-images.json): the names static.nanoka.cc did not serve, and
 * which of them the tracker serves itself. Resolve URLs with
 * `imageUrlOf` (`@gdt/game-data/image-url`).
 */
export const loadImageCoverage = once(async (): Promise<ImageCoverage> => {
  const file = (await import('../data/missing-images.json')).default as unknown as MissingImagesFile
  return { missing: new Set(file.missing), hosted: new Set(file.hosted ?? []) }
})

/** The names static.nanoka.cc did not serve at the last check (see loadImageCoverage). */
export const loadMissingImages = once(
  async (): Promise<ReadonlySet<string>> => (await loadImageCoverage()).missing,
)
