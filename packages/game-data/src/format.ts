/**
 * Shapes of the compiled files in `data/`.
 *
 * `scripts/build.ts` and `scripts/icons.ts` write them, the loaders in
 * `./index.ts` read them. Rows are tuples so the files, and the app chunks
 * Vite makes from them, stay small; each file names its tuple columns in
 * `columns` so it can be read without this file.
 *
 * Changing a shape means changing the writer, the loader and this file
 * together. The app only ever sees the decoded objects from `./index.ts`.
 */

export type Element = 'Anemo' | 'Geo' | 'Electro' | 'Dendro' | 'Hydro' | 'Pyro' | 'Cryo'

export type WeaponType = 'sword' | 'claymore' | 'polearm' | 'catalyst' | 'bow'

/** A character's three talents, as GOOD names them. */
export type TalentSlot = 'auto' | 'skill' | 'burst'

/**
 * What a planner material is for, from the cost slot the game puts it in.
 *
 * - `mora`, `exp` (character EXP books), `ore` (weapon enhancement ores)
 * - `gem` ascension gems, `boss` normal boss drops, `local` local specialties,
 *   `common` common enemy drops (character ascension, talents, weapons)
 * - `book` talent books, `weekly` weekly boss drops, `crown` Crown of Insight
 * - `weapon` weapon domain materials, `elite` elite enemy drops (weapons)
 * - `currency` what conversions spend (Dream Solvent, Dust of Azoth); no cost
 *   table uses it
 */
export type MaterialKind =
  | 'mora'
  | 'exp'
  | 'ore'
  | 'gem'
  | 'boss'
  | 'local'
  | 'common'
  | 'book'
  | 'weekly'
  | 'crown'
  | 'weapon'
  | 'elite'
  | 'currency'

export interface MetaFile {
  /** "7.1", from the dump commit's title. */
  gameVersion: string
  /** The dump repository the data came from. */
  repo: string
  sha: string
  commitTitle: string
  commitDate: string
  /** When a build last changed something in data/ (ISO). */
  builtAt: string
}

/** [id, goal, order, hidden, prevStage, primogems, progress, version, disused] */
export type AchievementRow = [
  id: number,
  goal: number,
  order: number,
  hidden: 0 | 1,
  prevStage: number,
  primogems: number,
  progress: number,
  version: string,
  disused: 0 | 1,
]

export interface AchievementsFile {
  columns: string[]
  rows: AchievementRow[]
}

/** [id, order, icon] */
export type GoalRow = [id: number, order: number, icon: string]

export interface GoalsFile {
  columns: string[]
  rows: GoalRow[]
}

/** Achievement and category names for one language (`data/text/<lang>.json`). */
export interface TextFile {
  /** goal id -> name */
  goals: Record<string, string>
  /** achievement id -> [title, description]; disused achievements without text are left out. */
  achievements: Record<string, [string, string]>
}

/** [material id, count] */
export type Cost = [id: number, count: number]

/**
 * One ascension phase: the level cap once it is reached, and its cost.
 * Index 0 is the un-ascended state (cap 20, free).
 */
export type AscensionPhaseRow = [cap: number, mora: number, items: Cost[]]

/** The cost of reaching one talent level. Index L-1 is level L; index 0 (level 1) is free. */
export type TalentLevelRow = [mora: number, items: Cost[]]

/**
 * [key, id, rarity, element, weapon, ascension, normal, skill, burst, c3, c5]
 * — ascension..burst name tables; c3/c5 are the talent each of those
 * constellations raises by 3 ('' when it raises none: Aloy, Manekin).
 */
export type CharacterRow = [
  key: string,
  id: number,
  rarity: number,
  element: Element | '',
  weapon: WeaponType,
  ascension: string,
  normal: string,
  skill: string,
  burst: string,
  c3: TalentSlot | '',
  c5: TalentSlot | '',
]

/** [key, id, rarity, type, ascension] */
export type WeaponRow = [
  key: string,
  id: number,
  rarity: number,
  type: WeaponType,
  ascension: string,
]

/** [id, key, name, rarity, kind, icon] */
export type MaterialRow = [
  id: number,
  key: string,
  name: string,
  rarity: number,
  kind: MaterialKind,
  icon: string,
]

/**
 * Tiers of one material (lowest first), keyed by the lowest tier's GOOD key.
 * `craft[i]` is the mora to craft one of tier i+2 from three of tier i+1; empty
 * when the game has no recipe (Brilliant Diamond). `domain` and `weekdays`
 * (0 = Sunday, JS `getDay()`) are set for talent books and weapon materials.
 */
export type FamilyRow = [
  key: string,
  kind: MaterialKind,
  members: number[],
  craft: number[],
  domain: string,
  weekdays: number[],
]

/** Domain of Mastery (`talent` books) or Domain of Forgery (`weapon` materials). */
export type DomainKind = 'talent' | 'weapon'

/**
 * One tier (I, II, …) of a domain: the Adventure Rank it needs, the Original
 * Resin and Mora of a run, and the game's own preview of the lowest-tier
 * material's average per run (0 when it shows none). That preview counts only
 * the first of two rolls, so it is a cross-check for `overrides/drops.json`,
 * not the rate.
 */
export type DomainTierRow = [ar: number, resin: number, mora: number, preview: number]

/**
 * A talent book or weapon material domain entrance (`DungeonEntry`):
 * [entry id, kind, entrance name, family keys in the game's day order
 * (Mon/Thu, Tue/Fri, Wed/Sat; all three on Sunday), tiers lowest first].
 */
export type DomainRow = [
  entry: number,
  kind: DomainKind,
  name: string,
  families: string[],
  tiers: DomainTierRow[],
]

/**
 * A weekly boss: [its three materials (any of them converts into another for
 * Dream Solvent), Dream Solvent per conversion, boss name, the boss levels
 * that drop them as [Adventure Rank, boss level] (empty when the boss is not
 * a domain: Andrius scales with World Level)].
 */
export type WeeklyBossRow = [
  items: number[],
  solvent: number,
  name: string,
  tiers: [ar: number, level: number][],
]

/** Weapon EXP ore forging: [ore GOOD key, input GOOD key, inputs per ore, Mora per ore, seconds per ore]. */
export type ForgeRow = [ore: string, input: string, count: number, mora: number, seconds: number]

/**
 * `avatars.json`: icon names (Enka `/ui/<name>.png`) for every planner
 * character and weapon, and the Traveler's portraits by gender (its GOOD keys
 * don't say which twin it is).
 */
export interface AvatarsFile {
  columns: { characters: ['icon', 'side']; weapons: ['icon', 'awaken'] }
  /** GOOD key -> [portrait, side icon]; no Traveler keys. */
  characters: Record<string, [string, string]>
  traveler: Record<'F' | 'M', [string, string]>
  /** GOOD key -> [icon, ascended icon (the base icon when there is none)]. */
  weapons: Record<string, [string, string]>
}

export interface PlannerFile {
  columns: {
    characters: string[]
    weapons: string[]
    materials: string[]
    families: string[]
    domains: string[]
    weeklyBosses: string[]
    forge: string[]
  }
  /** Highest level the planner plans to (levels 95/100 are not in the data). */
  levelCap: number
  /** Item id of Mora. */
  mora: number
  /** Mora spent per EXP point when levelling (a game rule, not in the dump). */
  moraPerExp: { character: number; weapon: number }
  /** characterExp[L-1]: EXP from level L to L+1. */
  characterExp: number[]
  /** weaponExp[rarity-1][L-1]: EXP from level L to L+1. */
  weaponExp: number[][]
  /** [item id, EXP it gives] */
  expItems: { character: Cost[]; weapon: Cost[] }
  /** Ascension tables: `c<avatarPromoteId>` for characters, `w<weaponPromoteId>` for weapons. */
  ascensions: Record<string, AscensionPhaseRow[]>
  /** Talent tables by proudSkillGroupId (identical tables share the lowest id). */
  talents: Record<string, TalentLevelRow[]>
  characters: CharacterRow[]
  weapons: WeaponRow[]
  materials: MaterialRow[]
  families: FamilyRow[]

  // Planner v2 (appended; the loader treats them as empty when missing).

  /**
   * Adventure Rank each ascension phase needs (`requiredPlayerLevel`), index =
   * phase. Every table agrees, so there is one list per kind; 1-2 star weapons
   * stop earlier and use the start of `weapon`.
   */
  promoteAR: { character: number[]; weapon: number[] }
  /** talentAscension[L-1]: the ascension phase talent level L needs (ProudSkill `breakLevel`). */
  talentAscension: number[]
  /** Talent book and weapon material domains. Every book/weapon family is in exactly one. */
  domains: DomainRow[]
  /** Weekly bosses, each with its Dream Solvent trio. */
  weeklyBosses: WeeklyBossRow[]
  /** Weekly materials no boss drops and no Dream Solvent recipe makes (GOOD keys). */
  unfarmable: string[]
  /** Billet trios that Dream Solvent converts: [item ids, solvent per conversion]. Not planner materials. */
  billets: [items: number[], solvent: number][]
  /** GOOD keys of the conversion currencies. */
  items: { dreamSolvent: string; dustOfAzoth: string }
  /**
   * Dust of Azoth gem conversion: dust per converted gem by tier (lowest
   * first), and the gem families that convert into each other (all but
   * Brilliant Diamond).
   */
  azoth: { dust: number[]; families: string[] }
  /** Weapon EXP ore recipes at the blacksmith (single-input ones). */
  forge: ForgeRow[]
  /** Weapon EXP a weapon gives when fed to another, by rarity (index rarity-1), before its own levels. */
  weaponBaseExp: number[]
  /**
   * Original Resin: its GOOD key, the items that hold resin as [GOOD key,
   * resin each], Condensed Resin as [GOOD key, most held], and the resin a
   * Ley Line Outcrop takes.
   */
  resin: {
    original: string
    items: [key: string, resin: number][]
    condensed: [key: string, max: number]
    leyLine: number
  }
  /** Utility passives that change what goals cost. */
  passives: {
    /** Weapon ascension Mora: [character key, weapon types, share saved (0.5)]. */
    ascensionMora: [character: string, types: WeaponType[], saved: number][]
    /**
     * Crafting: [character key, family kind crafted, 'double' (the product) or
     * 'refund' (of the inputs), chance, share (1 = one more product; 0.33 =
     * a third of the inputs)].
     */
    crafting: [
      character: string,
      kind: MaterialKind,
      effect: 'double' | 'refund',
      chance: number,
      share: number,
    ][]
  }
}

/**
 * Every material the tracker can show, by GOOD key: the item id when its icon
 * is `UI_ItemIcon_<id>`, else [id, n] for icon `UI_ItemIcon_<n>`, else
 * [id, icon name].
 */
export type MaterialIndexEntry = number | [id: number, icon: number | string]

export interface MaterialIndexFile {
  materials: Record<string, MaterialIndexEntry>
}

export type IconSource = 'override' | 'enka' | 'yatta' | 'nanoka'

/**
 * Icons self-hosted at `/gi/<name>.webp` (apps/tracker/public/gi), grouped by
 * where they came from, and the ones no source had.
 */
export interface IconsFile {
  sources: Record<IconSource, string[]>
  missing: string[]
}
