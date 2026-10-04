/**
 * Planner math over `loadPlanner()` data, pure and synchronous:
 *
 * - what one goal costs: a character from its current level, ascension and
 *   talents to a target (`characterRequirement`), a weapon from its level and
 *   ascension to a target (`weaponRequirement`). Refinement needs duplicate
 *   weapons, not materials, so it is a goal without a cost;
 * - what all goals cost together against an inventory, using spare lower
 *   tiers of a craftable family (3 -> 1, plus the crafting mora) before
 *   calling anything missing (`planTotals`);
 * - where the missing materials are farmed (`sourceGroups`), with domain days
 *   on the account's server (`serverWeekday`) and runs/resin only when
 *   `overrides/drops.json` has a rate for the source (`loadDrops`). Nothing
 *   is estimated without one.
 *
 * Levels follow the game's phases: ascension phase P allows levels up to
 * phase P's cap and needs the cap of phase P-1 first. EXP is counted in
 * points; the books and ores it takes are a separate step (`expItemMix`).
 */

import type {
  AscensionPhase,
  ExpItem,
  ItemCost,
  MaterialKind,
  PlannerData,
  PlannerMaterial,
} from './index'

// --- States and goals ----------------------------------------------------------

export interface Talents {
  auto: number
  skill: number
  burst: number
}

/** A character's level, ascension and (base) talent levels, as GOOD stores them. */
export interface CharacterState {
  level: number
  ascension: number
  talents: Talents
}

export interface WeaponState {
  level: number
  ascension: number
  refinement: number
}

/** The tracker's stored goal shapes (`CharacterTarget`/`WeaponTarget` in @gdt/shared). */
export interface CharacterGoal extends CharacterState {
  active: boolean
}

export interface WeaponGoal extends WeaponState {
  active: boolean
}

export const TALENTS = ['auto', 'skill', 'burst'] as const
export type TalentName = (typeof TALENTS)[number]

/** Talent level cap per ascension phase. */
const TALENT_CAPS = [1, 1, 2, 4, 6, 8, 10] as const

export function talentCap(ascension: number): number {
  return TALENT_CAPS[Math.max(0, Math.min(6, Math.trunc(ascension)))] ?? 1
}

export const NEW_CHARACTER: CharacterState = {
  level: 1,
  ascension: 0,
  talents: { auto: 1, skill: 1, burst: 1 },
}

export const NEW_WEAPON: WeaponState = { level: 1, ascension: 0, refinement: 1 }

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.trunc(Number.isFinite(value) ? value : min)))

/** The lowest phase whose level cap reaches `level`. */
export function ascensionForLevel(phases: readonly AscensionPhase[], level: number): number {
  const index = phases.findIndex((phase) => phase.cap >= level)
  return index < 0 ? phases.length - 1 : index
}

/**
 * A level/ascension pair the game allows: the level within the table, the
 * ascension at least what the level needs, and the level at least the cap
 * the ascension was reached at (phase 6 is only reachable at level 80).
 */
export function normalizeLevel(
  phases: readonly AscensionPhase[],
  level: number,
  ascension: number,
): { level: number; ascension: number } {
  const top = phases.length - 1
  let lv = clamp(level, 1, phases[top]?.cap ?? 1)
  const asc = Math.max(clamp(ascension, 0, top), ascensionForLevel(phases, lv))
  if (asc > 0) lv = Math.max(lv, phases[asc - 1]!.cap)
  return { level: lv, ascension: asc }
}

/** Level/ascension pairs a goal picker offers: 1, 20, 20+, 40, 40+, … up to the last cap. */
export function levelMilestones(
  phases: readonly AscensionPhase[],
): { level: number; ascension: number }[] {
  const list = [{ level: 1, ascension: 0 }]
  phases.forEach((phase, index) => {
    list.push({ level: phase.cap, ascension: index })
    if (index + 1 < phases.length) list.push({ level: phase.cap, ascension: index + 1 })
  })
  return list
}

// --- One goal ----------------------------------------------------------------

export interface Requirement {
  /** Ascension and talent materials by GOOD key (not EXP items or Mora). */
  items: Map<string, number>
  /** Mora for ascensions, talents and levelling (crafting is in `planTotals`). */
  mora: number
  /** EXP points to level a character. */
  characterExp: number
  /** EXP points to level a weapon. */
  weaponExp: number
}

export function emptyRequirement(): Requirement {
  return { items: new Map(), mora: 0, characterExp: 0, weaponExp: 0 }
}

/** Nothing left to spend: the goal is reached (or below the current state). */
export function isDone(requirement: Requirement): boolean {
  return (
    requirement.items.size === 0 &&
    requirement.mora === 0 &&
    requirement.characterExp === 0 &&
    requirement.weaponExp === 0
  )
}

function addItems(into: Map<string, number>, items: readonly ItemCost[]): void {
  for (const { material, count } of items) {
    if (count > 0) into.set(material.key, (into.get(material.key) ?? 0) + count)
  }
}

/** EXP from level `from` to level `to` on a curve where curve[L-1] is L -> L+1. */
export function levelExp(curve: readonly number[], from: number, to: number): number {
  let exp = 0
  for (let level = Math.max(1, from); level < to; level++) exp += curve[level - 1] ?? 0
  return exp
}

/** Mora for `exp` points at `rate` mora per point, rounded up (rates are 1/5 and 1/10). */
function expMora(exp: number, rate: number): number {
  return Math.ceil(Math.round(exp * rate * 1000) / 1000)
}

/**
 * The cost of taking a character from `current` to `target`; null when the
 * planner data has no such character (the element-less Traveler, a character
 * newer than the data). Talents use the character's own tables (per element
 * for the Traveler: pass `TravelerGeo`, …).
 */
export function characterRequirement(
  planner: PlannerData,
  key: string,
  current: CharacterState,
  target: CharacterState,
): Requirement | null {
  const character = planner.characters.get(key)
  if (!character) return null
  const phases = character.ascension
  const from = normalizeLevel(phases, current.level, current.ascension)
  const to = normalizeLevel(phases, target.level, target.ascension)
  const result = emptyRequirement()

  for (let phase = from.ascension + 1; phase <= to.ascension; phase++) {
    const step = phases[phase]!
    result.mora += step.mora
    addItems(result.items, step.items)
  }
  if (to.level > from.level) {
    result.characterExp = levelExp(planner.characterExp, from.level, to.level)
    result.mora += expMora(result.characterExp, planner.moraPerExp.character)
  }
  const tables = {
    auto: character.talents.normal,
    skill: character.talents.skill,
    burst: character.talents.burst,
  }
  for (const talent of TALENTS) {
    const table = tables[talent]
    const start = clamp(current.talents[talent], 1, table.length)
    const end = clamp(target.talents[talent], 1, table.length)
    for (let level = start + 1; level <= end; level++) {
      const step = table[level - 1]!
      result.mora += step.mora
      addItems(result.items, step.items)
    }
  }
  return result
}

/** The cost of levelling and ascending a weapon; null for a weapon the data lacks. */
export function weaponRequirement(
  planner: PlannerData,
  key: string,
  current: Pick<WeaponState, 'level' | 'ascension'>,
  target: Pick<WeaponState, 'level' | 'ascension'>,
): Requirement | null {
  const weapon = planner.weapons.get(key)
  if (!weapon) return null
  const phases = weapon.ascension
  const from = normalizeLevel(phases, current.level, current.ascension)
  const to = normalizeLevel(phases, target.level, target.ascension)
  const result = emptyRequirement()
  for (let phase = from.ascension + 1; phase <= to.ascension; phase++) {
    const step = phases[phase]!
    result.mora += step.mora
    addItems(result.items, step.items)
  }
  if (to.level > from.level) {
    const curve = planner.weaponExp[weapon.rarity - 1] ?? []
    result.weaponExp = levelExp(curve, from.level, to.level)
    result.mora += expMora(result.weaponExp, planner.moraPerExp.weapon)
  }
  return result
}

/**
 * EXP as the fewest items with the least waste: the largest item as often as
 * it fits, then the next, and the smallest rounded up (waste stays under one
 * small item). `items` smallest first, as `planner.expItems` lists them.
 */
export function expItemMix(exp: number, items: readonly ExpItem[]): ItemCost[] {
  if (exp <= 0 || items.length === 0) return []
  const mix: ItemCost[] = []
  let rest = exp
  for (let i = items.length - 1; i >= 0 && rest > 0; i--) {
    const item = items[i]!
    const count = i === 0 ? Math.ceil(rest / item.exp) : Math.floor(rest / item.exp)
    if (count > 0) {
      mix.push({ material: item.material, count })
      rest -= count * item.exp
    }
  }
  return mix
}

/** Total EXP the inventory holds as these items. */
export function expHeld(items: readonly ExpItem[], inventory: Readonly<Record<string, number>>) {
  return items.reduce((sum, item) => sum + (inventory[item.material.key] ?? 0) * item.exp, 0)
}

/**
 * Memoises requirements per (key, current, target): the page recomputes
 * totals on every edit, but each goal's cost only changes with its own
 * numbers.
 */
export function createRequirementCache(planner: PlannerData, limit = 5000) {
  const cache = new Map<string, Requirement | null>()
  const remember = (id: string, compute: () => Requirement | null) => {
    if (cache.has(id)) return cache.get(id)!
    if (cache.size >= limit) cache.clear()
    const value = compute()
    cache.set(id, value)
    return value
  }
  const t = (x: Talents) => `${x.auto}.${x.skill}.${x.burst}`
  return {
    character(key: string, current: CharacterState, target: CharacterState) {
      const id = `c|${key}|${current.level}.${current.ascension}.${t(current.talents)}|${target.level}.${target.ascension}.${t(target.talents)}`
      return remember(id, () => characterRequirement(planner, key, current, target))
    },
    weapon(key: string, current: WeaponState, target: WeaponState) {
      const id = `w|${key}|${current.level}.${current.ascension}|${target.level}.${target.ascension}`
      return remember(id, () => weaponRequirement(planner, key, current, target))
    },
  }
}

// --- Current state from an inventory --------------------------------------

/** The GOOD fields the planner reads (structurally a GOOD character/weapon). */
export interface OwnedCharacter {
  key: string
  level: number
  ascension: number
  talent: Talents
}

export interface OwnedWeapon {
  key: string
  level: number
  ascension: number
  refinement: number
  location: string
}

/**
 * A character's current state. GOOD has one Traveler entry, suffixed with the
 * element it is on (`TravelerGeo`): another element shares its level and
 * ascension but starts its talents at 1. Unowned characters start at level 1.
 */
export function findCharacterState(
  characters: readonly OwnedCharacter[],
  key: string,
): { state: CharacterState; owned: boolean } {
  const exact = characters.find((c) => c.key === key)
  if (exact) {
    return {
      state: { level: exact.level, ascension: exact.ascension, talents: { ...exact.talent } },
      owned: true,
    }
  }
  if (key.startsWith('Traveler')) {
    const traveler = characters.find((c) => c.key.startsWith('Traveler'))
    if (traveler) {
      return {
        state: {
          level: traveler.level,
          ascension: traveler.ascension,
          talents: { ...NEW_CHARACTER.talents },
        },
        owned: true,
      }
    }
  }
  return { state: { ...NEW_CHARACTER, talents: { ...NEW_CHARACTER.talents } }, owned: false }
}

const betterWeapon = (a: OwnedWeapon, b: OwnedWeapon) =>
  b.level - a.level || b.ascension - a.ascension || b.refinement - a.refinement

/**
 * A weapon goal's current state: the copy `owner` holds, else the best spare
 * copy, else the best copy anywhere (it moved), else a new one.
 */
export function findWeaponState(
  weapons: readonly OwnedWeapon[],
  key: string,
  owner: string,
): { state: WeaponState; owned: boolean } {
  const copies = weapons.filter((w) => w.key === key)
  const pick =
    (owner ? copies.find((w) => w.location === owner) : undefined) ??
    copies.filter((w) => !w.location).sort(betterWeapon)[0] ??
    [...copies].sort(betterWeapon)[0]
  if (!pick) return { state: { ...NEW_WEAPON }, owned: false }
  return {
    state: { level: pick.level, ascension: pick.ascension, refinement: pick.refinement },
    owned: true,
  }
}

// --- Totals against an inventory -----------------------------------------------

export interface PlanGoal {
  /** Stable id for "who needs this" (the page uses `character:Key`, `weapon:Key:Owner`). */
  id: string
  requirement: Requirement
  /** Inactive goals are kept but left out of the totals. */
  active?: boolean
}

export interface MaterialLine {
  material: PlannerMaterial
  need: number
  have: number
  /** Crafted into this tier from the tier below (3 -> 1). */
  crafted: number
  /** Spent crafting the tier above. */
  spent: number
  /** Still missing after crafting. */
  missing: number
  /** Goals needing this material, in goal order. */
  goals: string[]
}

export interface ExpTotal {
  /** EXP points. */
  need: number
  /** EXP held as books (or ores). */
  have: number
  missing: number
  /** The missing EXP as items to farm (`expItemMix`). */
  missingItems: ItemCost[]
  goals: string[]
}

export interface MoraTotal {
  /** Goals plus crafting. */
  need: number
  have: number
  missing: number
  /** Part of `need` spent crafting. */
  crafting: number
  goals: string[]
}

export interface PlanTotals {
  /**
   * Every material the goals need, by GOOD key, plus the other tiers of each
   * needed family (their spares may be crafted up), lowest tier first.
   */
  lines: Map<string, MaterialLine>
  characterExp: ExpTotal
  weaponExp: ExpTotal
  mora: MoraTotal
}

/**
 * Sums the active goals and compares them with `inventory` (GOOD key -> count).
 * In a craftable family each tier first uses its own stock, then crafts from
 * the spare stock below it (spares climb tier by tier), and crafting costs
 * the family's mora per item. Lower tiers cannot be made from higher ones.
 */
export function planTotals(
  planner: PlannerData,
  goals: readonly PlanGoal[],
  inventory: Readonly<Record<string, number>>,
): PlanTotals {
  const held = (key: string) => Math.max(0, Math.trunc(inventory[key] ?? 0))
  const need = new Map<string, number>()
  const who = new Map<string, string[]>()
  const exp = { character: 0, weapon: 0 }
  const expGoals = { character: [] as string[], weapon: [] as string[] }
  let goalMora = 0
  const moraGoals: string[] = []

  for (const goal of goals) {
    if (goal.active === false) continue
    const r = goal.requirement
    for (const [key, count] of r.items) {
      need.set(key, (need.get(key) ?? 0) + count)
      const list = who.get(key)
      if (list) list.push(goal.id)
      else who.set(key, [goal.id])
    }
    if (r.characterExp > 0) {
      exp.character += r.characterExp
      expGoals.character.push(goal.id)
    }
    if (r.weaponExp > 0) {
      exp.weapon += r.weaponExp
      expGoals.weapon.push(goal.id)
    }
    if (r.mora > 0) {
      goalMora += r.mora
      moraGoals.push(goal.id)
    }
  }

  const lines = new Map<string, MaterialLine>()
  const line = (material: PlannerMaterial): MaterialLine => ({
    material,
    need: need.get(material.key) ?? 0,
    have: held(material.key),
    crafted: 0,
    spent: 0,
    missing: 0,
    goals: who.get(material.key) ?? [],
  })
  let craftingMora = 0
  const done = new Set<string>()

  for (const key of need.keys()) {
    if (done.has(key)) continue
    const material = planner.materialsByKey.get(key)
    if (!material) {
      // Not in the planner data (cannot happen for requirements built from it).
      const count = need.get(key) ?? 0
      const have = held(key)
      lines.set(key, {
        material: {
          id: 0,
          key,
          name: key,
          rarity: 1,
          kind: 'common',
          icon: '',
          family: null,
          tier: 0,
        },
        need: count,
        have,
        crafted: 0,
        spent: 0,
        missing: Math.max(0, count - have),
        goals: who.get(key) ?? [],
      })
      done.add(key)
      continue
    }
    const family = material.family
    if (!family) {
      const l = line(material)
      l.missing = Math.max(0, l.need - l.have)
      lines.set(key, l)
      done.add(key)
      continue
    }
    const tiers = family.members.map(line)
    craftingMora += craftFamily(tiers, family.craftMora)
    for (const l of tiers) {
      lines.set(l.material.key, l)
      done.add(l.material.key)
    }
  }

  const expTotal = (kind: 'character' | 'weapon'): ExpTotal => {
    const items = planner.expItems[kind]
    const have = expHeld(items, inventory)
    const missing = Math.max(0, exp[kind] - have)
    return {
      need: exp[kind],
      have,
      missing,
      missingItems: expItemMix(missing, items),
      goals: expGoals[kind],
    }
  }

  const moraNeed = goalMora + craftingMora
  const moraHave = held(planner.mora.key)
  return {
    lines,
    characterExp: expTotal('character'),
    weaponExp: expTotal('weapon'),
    mora: {
      need: moraNeed,
      have: moraHave,
      missing: Math.max(0, moraNeed - moraHave),
      crafting: craftingMora,
      goals: moraGoals,
    },
  }
}

/**
 * Fills `crafted`, `spent` and `missing` on one family's tiers (lowest
 * first) and returns the crafting mora. Pass 1 finds how many of each tier
 * the spares below could make; pass 2 walks down from the top, crafting only
 * what a tier is short of, so a craft is only counted (and paid) when used.
 * `craftMora` empty means the family cannot be crafted.
 */
export function craftFamily(tiers: MaterialLine[], craftMora: readonly number[]): number {
  const n = tiers.length
  const craftable = craftMora.length >= n - 1 && n > 1
  // Pass 1: the most each tier could receive from below.
  const canCraft = new Array<number>(n).fill(0)
  if (craftable) {
    for (let t = 1; t < n; t++) {
      const below = tiers[t - 1]!
      const spare = Math.max(0, below.have + canCraft[t - 1]! - below.need)
      canCraft[t] = Math.floor(spare / 3)
    }
  }
  // Pass 2: from the top, craft only what is short.
  let mora = 0
  let demand = tiers[n - 1]?.need ?? 0
  for (let t = n - 1; t >= 0; t--) {
    const tier = tiers[t]!
    const short = Math.max(0, demand - tier.have)
    const crafted = Math.min(short, canCraft[t]!)
    tier.crafted = crafted
    tier.missing = short - crafted
    if (crafted > 0) {
      mora += crafted * (craftMora[t - 1] ?? 0)
      tiers[t - 1]!.spent = crafted * 3
    }
    demand = t > 0 ? tiers[t - 1]!.need + crafted * 3 : 0
  }
  return mora
}

// --- Where to farm ---------------------------------------------------------

/**
 * Farming sources, Seelie-style: `talent` and `weapon` domains (by family),
 * `weekly` and normal `boss` drops, ascension `gem`s, `local` specialties,
 * `enemy` drops (common and elite families) and the `crown`.
 */
export type SourceKind =
  | 'talent'
  | 'weapon'
  | 'weekly'
  | 'boss'
  | 'gem'
  | 'local'
  | 'enemy'
  | 'crown'

export const SOURCE_ORDER: readonly SourceKind[] = [
  'talent',
  'weapon',
  'weekly',
  'boss',
  'gem',
  'local',
  'enemy',
  'crown',
]

const SOURCE_OF: Record<MaterialKind, SourceKind | null> = {
  book: 'talent',
  weapon: 'weapon',
  weekly: 'weekly',
  boss: 'boss',
  gem: 'gem',
  local: 'local',
  common: 'enemy',
  elite: 'enemy',
  crown: 'crown',
  mora: null,
  exp: null,
  ore: null,
}

export interface Estimate {
  runs: number
  resin: number
}

export interface SourceGroup {
  /** `${kind}:${key}` */
  id: string
  kind: SourceKind
  /** Family key (lowest tier) or, for single materials, the material key. */
  key: string
  /** "Freedom", "Tile of Decarabian's Tower", "Agnidus Agate", "Hurricane Seed". */
  name: string
  /** Domain name for talent books and weapon materials, else ''. */
  domain: string
  /** Days the domain drops it (0 = Sunday); empty when not a domain. */
  weekdays: readonly number[]
  /** Lowest tier first. */
  lines: MaterialLine[]
  /** Goals needing anything here, in first-need order. */
  goals: string[]
  need: number
  missing: number
  /** Missing in units of the lowest tier (3 per step up in a craftable family). */
  missingUnits: number
  /** Runs and resin from `drops.json`; null without a rate (no guessing). */
  estimate: Estimate | null
}

/** Drop rate of a source: lowest-tier units per run, and the resin a run costs. */
export interface DropRate {
  perRun: number
  resin: number
}

export type DropTable = ReadonlyMap<string, DropRate>

/**
 * `overrides/drops.json`: `{ "<family or material GOOD key>": { "perRun": 2.2, "resin": 20 } }`,
 * perRun in lowest-tier units. `$` keys are comments; malformed rows are skipped.
 */
export function parseDrops(json: unknown): DropTable {
  const table = new Map<string, DropRate>()
  if (!json || typeof json !== 'object') return table
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (key.startsWith('$') || !value || typeof value !== 'object') continue
    const { perRun, resin } = value as Record<string, unknown>
    if (typeof perRun !== 'number' || !(perRun > 0)) continue
    table.set(key, { perRun, resin: typeof resin === 'number' && resin >= 0 ? resin : 0 })
  }
  return table
}

let drops: Promise<DropTable> | undefined

/** The hand-kept drop rates (empty until someone fills `overrides/drops.json`). */
export function loadDrops(): Promise<DropTable> {
  drops ??= import('../overrides/drops.json')
    .then((m) => parseDrops(m.default))
    .catch(() => {
      drops = undefined
      return new Map()
    })
  return drops
}

const PREFIXES = /^(Teachings of|Guide to|Philosophies of) /

function familyName(kind: SourceKind, first: PlannerMaterial): string {
  if (kind === 'talent') return first.name.replace(PREFIXES, '')
  if (kind === 'gem') return first.name.replace(/ Sliver$/, '')
  return first.name
}

/** Groups the lines that something needs by where they drop. */
export function sourceGroups(totals: PlanTotals, rates: DropTable | null = null): SourceGroup[] {
  const groups = new Map<string, SourceGroup>()
  for (const l of totals.lines.values()) {
    const kind = SOURCE_OF[l.material.kind]
    if (!kind) continue
    const family = l.material.family
    const key = family?.key ?? l.material.key
    const id = `${kind}:${key}`
    let group = groups.get(id)
    if (!group) {
      group = {
        id,
        kind,
        key,
        name: familyName(kind, family?.members[0] ?? l.material),
        domain: family?.domain ?? '',
        weekdays: family?.weekdays ?? [],
        lines: [],
        goals: [],
        need: 0,
        missing: 0,
        missingUnits: 0,
        estimate: null,
      }
      groups.set(id, group)
    }
    group.lines.push(l)
  }

  const result: SourceGroup[] = []
  for (const group of groups.values()) {
    group.lines.sort((a, b) => a.material.tier - b.material.tier)
    if (!group.lines.some((l) => l.need > 0)) continue
    const goals = new Set<string>()
    const craftable = (group.lines[0]?.material.family?.craftMora.length ?? 0) > 0
    for (const l of group.lines) {
      l.goals.forEach((g) => goals.add(g))
      group.need += l.need
      group.missing += l.missing
      group.missingUnits += l.missing * (craftable ? 3 ** Math.max(0, l.material.tier - 1) : 1)
    }
    group.goals = [...goals]
    const rate = rates?.get(group.key)
    if (rate && group.missingUnits > 0) {
      const runs = Math.ceil(group.missingUnits / rate.perRun)
      group.estimate = { runs, resin: runs * rate.resin }
    }
    result.push(group)
  }
  const order = (kind: SourceKind) => SOURCE_ORDER.indexOf(kind)
  return result.sort(
    (a, b) =>
      order(a.kind) - order(b.kind) ||
      Number(b.missing > 0) - Number(a.missing > 0) ||
      b.missingUnits - a.missingUnits ||
      a.name.localeCompare(b.name),
  )
}

/** Resin regenerates one per 8 minutes. */
export const RESIN_PER_DAY = 180

/**
 * Resin and days for every group that has an estimate; `partial` when some
 * group with something missing has none. Null when no group has one.
 */
export function planEstimate(
  groups: readonly SourceGroup[],
): { resin: number; days: number; partial: boolean } | null {
  let resin = 0
  let any = false
  let partial = false
  for (const group of groups) {
    if (group.missing === 0) continue
    if (group.estimate) {
      any = true
      resin += group.estimate.resin
    } else if (group.kind !== 'local' && group.kind !== 'crown') partial = true
  }
  return any ? { resin, days: Math.ceil(resin / RESIN_PER_DAY), partial } : null
}

// --- Domain days -------------------------------------------------------------

export type Server = 'AMERICA' | 'EUROPE' | 'ASIA' | 'SAR'

/** Server time zones (hours from UTC); the day turns at 04:00 server time. */
export const SERVER_UTC_OFFSET: Record<Server, number> = {
  AMERICA: -5,
  EUROPE: 1,
  ASIA: 8,
  SAR: 8,
}

export const RESET_HOUR = 4

/**
 * The game day (0 = Sunday, like Date#getDay) at `now` on a server. Without
 * a server, the browser's own time zone with the same 04:00 reset.
 */
export function serverWeekday(now: number, server: string | null | undefined): number {
  const offset = server && server in SERVER_UTC_OFFSET ? SERVER_UTC_OFFSET[server as Server] : null
  if (offset === null) return new Date(now - RESET_HOUR * 3_600_000).getDay()
  return new Date(now + (offset - RESET_HOUR) * 3_600_000).getUTCDay()
}

/** Milliseconds until the next 04:00 reset on a server (for re-evaluating "today"). */
export function msUntilReset(now: number, server: string | null | undefined): number {
  const offset = server && server in SERVER_UTC_OFFSET ? SERVER_UTC_OFFSET[server as Server] : null
  const day = 86_400_000
  const shift =
    offset === null
      ? -new Date(now).getTimezoneOffset() * 60_000 - RESET_HOUR * 3_600_000
      : (offset - RESET_HOUR) * 3_600_000
  const intoDay = (((now + shift) % day) + day) % day
  return day - intoDay
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
