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

/**
 * What a planner material is for, from the cost slot the game puts it in.
 *
 * - `mora`, `exp` (character EXP books), `ore` (weapon enhancement ores)
 * - `gem` ascension gems, `boss` normal boss drops, `local` local specialties,
 *   `common` common enemy drops (character ascension, talents, weapons)
 * - `book` talent books, `weekly` weekly boss drops, `crown` Crown of Insight
 * - `weapon` weapon domain materials, `elite` elite enemy drops (weapons)
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

/** [key, id, rarity, element, weapon, ascension, normal, skill, burst] — the last four name tables. */
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
