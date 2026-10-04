/**
 * Planner data: what levelling, ascending and talent levels cost, for every
 * playable character and weapon, plus the materials involved.
 *
 * Sources (ExcelBinOutput):
 * - AvatarExcelConfigData: playable characters (`useType` AVATAR_FORMAL and
 *   `featureTagGroupID == id`, which drops trial copies, UGC and test avatars;
 *   the remaining placeholders are excluded in overrides/keys.json).
 * - AvatarSkillDepot -> AvatarSkill -> ProudSkill: talent costs. Only
 *   `skills[0]` (normal attack), `skills[1]` (skill) and `energySkill` (burst)
 *   are talents; extra skills (alternate sprints, Vesna's extras) are not.
 *   Characters with `candSkillDepotIds` change element: the Traveler gets one
 *   entry per element (`TravelerAnemo`…, as irminsul names them), Manekin and
 *   Manekina cost the same in every element and get one entry.
 * - AvatarPromote / WeaponPromote: ascension costs; AvatarLevel / WeaponLevel:
 *   EXP curves; Material `itemUse`: what EXP books and ores give.
 * - Combine: which materials are tiers of one family (3 -> 1 crafting).
 * - MaterialSourceData -> Dungeon: the domain of talent books and weapon
 *   materials. Domain weekdays come from overrides/weekdays.json, else from
 *   the game's domain reward list (DungeonEntry `descriptionCycleRewardList`).
 * - `requiredPlayerLevel` (ascension) and ProudSkill `breakLevel` (talents):
 *   the Adventure Rank and ascension each step needs.
 * - Domains, weekly bosses, conversions, forging, resin and passives:
 *   scripts/compile/farming.ts.
 *
 * Each cost slot has a fixed meaning, which gives every material its kind:
 * character ascension = gem, boss, local specialty, common drop; talents =
 * book, common drop, weekly boss, crown; weapons = weapon material, elite
 * drop, common drop.
 *
 * Levels above 90 (AvatarExtraLevel) are left out: that table is obfuscated
 * and the EXP for levels 91-100 is not in AvatarLevelExcelConfigData.
 */

import type {
  AscensionPhaseRow,
  CharacterRow,
  Cost,
  Element,
  FamilyRow,
  MaterialKind,
  MaterialRow,
  PlannerFile,
  TalentLevelRow,
  TalentSlot,
  WeaponRow,
  WeaponType,
} from '../../src/format.ts'
import { checkFields, costs, list, num, str, type Row, type TextMap } from '../lib/excel.ts'
import { compareKeys, sortedObject } from '../lib/json.ts'
import {
  WEEKDAY_SETS,
  type KeysOverride,
  type PlannerOverride,
  type WeekdaysOverride,
  type WeekdaySet,
} from '../lib/overrides.ts'
import type { Problems } from '../lib/problems.ts'
import {
  compileFarming,
  DREAM_SOLVENT,
  DUST_OF_AZOTH,
  FARMING_FILES,
  type CompiledFarming,
} from './farming.ts'

export const PLANNER_FILES = {
  avatars: 'ExcelBinOutput/AvatarExcelConfigData.json',
  depots: 'ExcelBinOutput/AvatarSkillDepotExcelConfigData.json',
  skills: 'ExcelBinOutput/AvatarSkillExcelConfigData.json',
  proudSkills: 'ExcelBinOutput/ProudSkillExcelConfigData.json',
  avatarPromotes: 'ExcelBinOutput/AvatarPromoteExcelConfigData.json',
  avatarLevels: 'ExcelBinOutput/AvatarLevelExcelConfigData.json',
  weapons: 'ExcelBinOutput/WeaponExcelConfigData.json',
  weaponPromotes: 'ExcelBinOutput/WeaponPromoteExcelConfigData.json',
  weaponLevels: 'ExcelBinOutput/WeaponLevelExcelConfigData.json',
  materials: 'ExcelBinOutput/MaterialExcelConfigData.json',
  materialSources: 'ExcelBinOutput/MaterialSourceDataExcelConfigData.json',
  dungeons: 'ExcelBinOutput/DungeonExcelConfigData.json',
  dungeonEntries: 'ExcelBinOutput/DungeonEntryExcelConfigData.json',
  combines: 'ExcelBinOutput/CombineExcelConfigData.json',
  avatarTalents: 'ExcelBinOutput/AvatarTalentExcelConfigData.json',
  ...FARMING_FILES,
} as const

export type PlannerInputs = { [K in keyof typeof PLANNER_FILES]: Row[] } & {
  /** TextMap_MediumEN only: the names irminsul turns into GOOD keys. */
  names: TextMap
  /** Display text (TextMap_MediumEN + TextMapEN), for domain names. */
  text: TextMap
}

export interface PlannerContext {
  keys: KeysOverride
  weekdays: WeekdaysOverride
  /** overrides/planner.json */
  planner: PlannerOverride
  toGoodKey: (name: string) => string
  problems: Problems
}

/** The item id of Mora, a fixed virtual item since 1.0. */
const MORA = 202
/** Planner targets stop here; see the header comment for 95/100. */
const LEVEL_CAP = 90
/** Mora per EXP point: 1 per 5 character EXP, 1 per 10 weapon EXP (game rules, not in the dump). */
const MORA_PER_EXP = { character: 0.2, weapon: 0.1 }

const QUALITY: Record<string, number> = {
  QUALITY_ORANGE: 5,
  QUALITY_ORANGE_SP: 5,
  QUALITY_PURPLE: 4,
}
const WEAPON_TYPES: Record<string, WeaponType> = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_CATALYST: 'catalyst',
  WEAPON_BOW: 'bow',
}
/** A burst's `costElemType` -> element. */
const ELEMENTS: Record<string, Element> = {
  Wind: 'Anemo',
  Rock: 'Geo',
  Electric: 'Electro',
  Grass: 'Dendro',
  Water: 'Hydro',
  Fire: 'Pyro',
  Ice: 'Cryo',
}
/** The fixed meaning of each cost slot. */
const AVATAR_PROMOTE_SLOTS: MaterialKind[] = ['gem', 'boss', 'local', 'common']
const TALENT_SLOTS: MaterialKind[] = ['book', 'common', 'weekly', 'crown']
const WEAPON_PROMOTE_SLOTS: MaterialKind[] = ['weapon', 'elite', 'common']
/** Kinds that come in tiers; each must belong to a family. */
const TIERED = new Set<MaterialKind>(['gem', 'common', 'book', 'weapon', 'elite'])
/** EXP items: the use that gives EXP and the material type that holds the real items. */
const EXP_ITEMS = [
  { use: 'ITEM_USE_ADD_EXP', type: 'MATERIAL_EXP_FRUIT', kind: 'exp' },
  { use: 'ITEM_USE_ADD_WEAPON_EXP', type: 'MATERIAL_WEAPON_EXP_STONE', kind: 'ore' },
] as const
/** DungeonEntry `descriptionCycleRewardList` positions: the in-game "rewards by day" list. */
const CYCLE_DAYS: WeekdaySet[] = ['mon-thu', 'tue-fri', 'wed-sat']

export const CHARACTER_COLUMNS = [
  'key',
  'id',
  'rarity',
  'element',
  'weapon',
  'ascension',
  'normal',
  'skill',
  'burst',
  'c3',
  'c5',
]
export const WEAPON_COLUMNS = ['key', 'id', 'rarity', 'type', 'ascension']
export const MATERIAL_COLUMNS = ['id', 'key', 'name', 'rarity', 'kind', 'icon']
export const FAMILY_COLUMNS = ['key', 'kind', 'members', 'craft', 'domain', 'weekdays']
export const DOMAIN_COLUMNS = [
  'entry',
  'kind',
  'name',
  'families',
  'tiers [ar, resin, mora, preview]',
]
export const WEEKLY_COLUMNS = ['items', 'solvent', 'name', 'tiers [ar, level]']
export const FORGE_COLUMNS = ['ore', 'input', 'count', 'mora', 'seconds']

function groupBy(rows: Row[], field: string): Map<number, Row[]> {
  const map = new Map<number, Row[]>()
  for (const row of rows) {
    const key = num(row, field)
    const group = map.get(key)
    if (group) group.push(row)
    else map.set(key, [row])
  }
  return map
}

const tableKeyOrder = (a: string, b: string) => {
  const pa = a.replace(/\d+$/, '')
  const pb = b.replace(/\d+$/, '')
  if (pa !== pb) return pa < pb ? -1 : 1
  return Number(a.slice(pa.length)) - Number(b.slice(pb.length))
}

/** Cost tables keyed by source id; identical tables are merged under the lowest id. */
class TableSet<T> {
  private readonly tables = new Map<string, T>()

  set(key: string, table: T): void {
    this.tables.set(key, table)
  }

  finish(): { tables: Record<string, T>; canonical: Map<string, string> } {
    const byContent = new Map<string, string>()
    const canonical = new Map<string, string>()
    const kept: [string, T][] = []
    for (const key of [...this.tables.keys()].sort(tableKeyOrder)) {
      const table = this.tables.get(key) as T
      const content = JSON.stringify(table)
      const first = byContent.get(content)
      if (first) {
        canonical.set(key, first)
      } else {
        byContent.set(content, key)
        canonical.set(key, key)
        kept.push([key, table])
      }
    }
    return { tables: Object.fromEntries(kept), canonical }
  }
}

interface Candidate<R> {
  key: string
  id: number
  /** Row with table keys still un-canonicalised. */
  row: R
}

export interface CompiledPlanner {
  planner: PlannerFile
  /** Planner material id -> GOOD key (the material index must agree). */
  materialKeys: Map<number, string>
  /** Game values the build compares with overrides/drops.json. */
  checks: CompiledFarming['checks']
}

export function compilePlanner(inputs: PlannerInputs, context: PlannerContext): CompiledPlanner {
  const { problems, keys } = context
  checkInputs(inputs, problems)

  const materials = new Map(inputs.materials.map((m) => [num(m, 'id'), m]))
  const skills = new Map(inputs.skills.map((s) => [num(s, 'id'), s]))
  const constellations = new Map(inputs.avatarTalents.map((t) => [num(t, 'talentId'), t]))
  /**
   * The talent a constellation raises by 3: its text names the talent
   * ("Increases the Level of <talent> by 3"; Neuvillette's C3 is his Normal
   * Attack). The longest talent name found wins; '' when it names none.
   */
  const boostOf = (depot: Row, index: number, names: string[], what: string): TalentSlot | '' => {
    const talent = constellations.get(list<number>(depot, 'talents')[index] ?? 0)
    const text = (inputs.text.get(talent?.descTextMapHash) ?? '').replace(/<[^>]+>/g, '')
    const slots: TalentSlot[] = ['auto', 'skill', 'burst']
    const hits = names
      .map((name, i) => ({ name, slot: slots[i]! }))
      .filter((n) => n.name && text.includes(n.name))
      .sort((a, b) => b.name.length - a.name.length)
    if (hits.length === 0 && /by 3\b/.test(text)) {
      problems.warn(
        `${what}: C${index + 1} raises a talent its text doesn't name ("${text.slice(0, 80)}")`,
      )
    }
    return hits[0]?.slot ?? ''
  }
  const depots = new Map(inputs.depots.map((d) => [num(d, 'id'), d]))
  const avatarPromotes = groupBy(inputs.avatarPromotes, 'avatarPromoteId')
  const weaponPromotes = groupBy(inputs.weaponPromotes, 'weaponPromoteId')
  const proudSkills = groupBy(inputs.proudSkills, 'proudSkillGroupId')

  /** material id -> kinds it was used as */
  const usage = new Map<number, Set<MaterialKind>>()
  const use = (id: number, kind: MaterialKind) => {
    const kinds = usage.get(id) ?? new Set<MaterialKind>()
    kinds.add(kind)
    usage.set(id, kinds)
  }
  /** Tier sequences seen in ascension slots: the fallback for families without a Combine recipe. */
  const slotSequences = new Map<number, number[]>()

  const ascensions = new TableSet<AscensionPhaseRow[]>()
  const talents = new TableSet<TalentLevelRow[]>()
  /** Ascension table key -> Adventure Rank per phase. */
  const promoteAR = new Map<string, number[]>()
  /** Talent group -> ascension needed per level (ProudSkill breakLevel). */
  const talentBreaks = new Map<number, number[]>()

  const ascension = (
    table: string,
    rows: Row[] | undefined,
    slots: MaterialKind[],
    moraField: string,
    what: string,
  ): AscensionPhaseRow[] | null => {
    if (!rows?.length) {
      problems.error(`${what}: no ascension rows`)
      return null
    }
    const sorted = [...rows].sort((a, b) => num(a, 'promoteLevel') - num(b, 'promoteLevel'))
    const bySlot = new Map<number, number[]>()
    const phases: AscensionPhaseRow[] = []
    for (const [index, row] of sorted.entries()) {
      if (num(row, 'promoteLevel') !== index) {
        problems.error(`${what}: ascension phases are not 0..${sorted.length - 1}`)
        return null
      }
      const items: Cost[] = []
      for (const cost of costs(row, 'costItems')) {
        const kind = slots[cost.slot]
        if (!kind) {
          problems.error(`${what}: ascension ${index} has an item in unexpected slot ${cost.slot}`)
          continue
        }
        use(cost.id, kind)
        items.push([cost.id, cost.count])
        const sequence = bySlot.get(cost.slot) ?? []
        if (!sequence.includes(cost.id)) sequence.push(cost.id)
        bySlot.set(cost.slot, sequence)
      }
      phases.push([num(row, 'unlockMaxLevel'), num(row, moraField), items])
    }
    promoteAR.set(
      table,
      sorted.map((row) => num(row, 'requiredPlayerLevel')),
    )
    for (const sequence of bySlot.values()) {
      for (const id of sequence) if (!slotSequences.has(id)) slotSequences.set(id, sequence)
    }
    return phases
  }

  const talent = (group: number, what: string): TalentLevelRow[] | null => {
    const byLevel = new Map((proudSkills.get(group) ?? []).map((r) => [num(r, 'level'), r]))
    const table: TalentLevelRow[] = []
    const breaks: number[] = []
    for (let level = 1; level <= 10; level++) {
      const row = byLevel.get(level)
      if (!row) {
        problems.error(`${what}: talent group ${group} has no level ${level}`)
        return null
      }
      breaks.push(num(row, 'breakLevel'))
      const items: Cost[] = []
      for (const cost of costs(row, 'costItems')) {
        const kind = TALENT_SLOTS[cost.slot]
        if (!kind) {
          problems.error(
            `${what}: talent level ${level} has an item in unexpected slot ${cost.slot}`,
          )
          continue
        }
        use(cost.id, kind)
        items.push([cost.id, cost.count])
      }
      const mora = num(row, 'coinCost')
      if (level > 1 && (mora === 0 || items.length === 0)) {
        problems.error(`${what}: talent group ${group} level ${level} costs nothing`)
      }
      table.push([mora, items])
    }
    talentBreaks.set(group, breaks)
    return table
  }

  // --- characters ---------------------------------------------------------
  const characterCandidates: Candidate<CharacterRow>[] = []
  for (const avatar of inputs.avatars) {
    const id = num(avatar, 'id')
    if (str(avatar, 'useType') !== 'AVATAR_FORMAL' || num(avatar, 'featureTagGroupID') !== id)
      continue
    if (keys.characters.exclude.has(id)) continue
    const name = inputs.names.get(avatar.nameTextMapHash)
    if (!name) {
      problems.warn(
        `Avatar ${id} has no name in TextMap_MediumEN (irminsul cannot export it); left out`,
      )
      continue
    }
    const baseKey = keys.characters.key.get(id) ?? context.toGoodKey(name)
    const what = `Character ${baseKey} (${id})`
    const rarity = QUALITY[str(avatar, 'qualityType')]
    const weapon = WEAPON_TYPES[str(avatar, 'weaponType')]
    if (!rarity) problems.error(`${what}: unknown qualityType "${str(avatar, 'qualityType')}"`)
    if (!weapon) {
      problems.error(
        `${what}: unknown weaponType "${str(avatar, 'weaponType')}" (add it to WEAPON_TYPES, or exclude the avatar in overrides/keys.json)`,
      )
    }
    const promoteId = num(avatar, 'avatarPromoteId')
    const asc = ascension(
      `c${promoteId}`,
      avatarPromotes.get(promoteId),
      AVATAR_PROMOTE_SLOTS,
      'scoinCost',
      what,
    )
    if (!rarity || !weapon || !asc) continue
    ascensions.set(`c${promoteId}`, asc)

    const depotIds = list<number>(avatar, 'candSkillDepotIds').filter((d) => d > 0)
    if (depotIds.length === 0) depotIds.push(num(avatar, 'skillDepotId'))
    const variants: {
      element: Element
      groups: [number, number, number]
      boosts: [TalentSlot | '', TalentSlot | '']
    }[] = []
    for (const depotId of depotIds) {
      const depot = depots.get(depotId)
      if (!depot) {
        problems.error(`${what}: skill depot ${depotId} does not exist`)
        continue
      }
      const burst = num(depot, 'energySkill')
      // A depot without a burst is the element-less state (the Traveler
      // before resonating with a Statue); it has no full talent set.
      if (!burst) continue
      const skillIds = list<number>(depot, 'skills')
      const ids = [skillIds[0] ?? 0, skillIds[1] ?? 0, burst]
      const groups = ids.map((skillId) => num(skills.get(skillId) ?? {}, 'proudSkillGroupId'))
      const element = ELEMENTS[str(skills.get(burst) ?? {}, 'costElemType')]
      if (!element) {
        problems.error(
          `${what}: burst ${burst} has unknown element "${str(skills.get(burst) ?? {}, 'costElemType')}"`,
        )
        continue
      }
      if (groups.some((g) => g === 0)) {
        problems.error(`${what}: depot ${depotId} is missing a talent (skills ${ids.join(', ')})`)
        continue
      }
      let complete = true
      for (const group of groups) {
        const table = talent(group, what)
        if (table) talents.set(String(group), table)
        else complete = false
      }
      const names = ids.map(
        (skillId) => inputs.text.get(skills.get(skillId)?.nameTextMapHash) ?? '',
      )
      if (complete) {
        variants.push({
          element,
          groups: groups as [number, number, number],
          boosts: [boostOf(depot, 2, names, what), boostOf(depot, 4, names, what)],
        })
      }
    }
    if (variants.length === 0) {
      problems.error(`${what}: no skill depot with a full talent set`)
      continue
    }

    const row = (
      key: string,
      element: Element | '',
      groups: [number, number, number],
      boosts: [TalentSlot | '', TalentSlot | ''],
    ): Candidate<CharacterRow> => ({
      key,
      id,
      row: [
        key,
        id,
        rarity,
        element,
        weapon,
        `c${promoteId}`,
        ...(groups.map(String) as [string, string, string]),
        ...boosts,
      ],
    })
    if (baseKey === 'Traveler') {
      // irminsul suffixes the Traveler's key with the current element.
      for (const v of variants)
        characterCandidates.push(row(`Traveler${v.element}`, v.element, v.groups, v.boosts))
    } else if (variants.length === 1) {
      const [v] = variants as [(typeof variants)[number]]
      characterCandidates.push(row(baseKey, v.element, v.groups, v.boosts))
    } else {
      // One key for every element (Manekin, Manekina): the talents must cost the same.
      const tablesOf = (v: (typeof variants)[number]) =>
        JSON.stringify(v.groups.map((g) => talent(g, what)))
      const first = tablesOf(variants[0]!)
      if (variants.some((v) => tablesOf(v) !== first)) {
        problems.error(
          `${what}: talent costs differ between elements but irminsul exports one key; ` +
            'add a per-element case like the Traveler in compilePlanner',
        )
        continue
      }
      const boosts = variants[0]!.boosts
      characterCandidates.push(
        row(
          baseKey,
          '',
          variants[0]!.groups,
          variants.every((v) => v.boosts.join() === boosts.join()) ? boosts : ['', ''],
        ),
      )
    }
  }

  // --- weapons -----------------------------------------------------------
  const weaponCandidates: Candidate<WeaponRow>[] = []
  for (const weapon of inputs.weapons) {
    const id = num(weapon, 'id')
    const included = keys.weapons.include.has(id)
    if (keys.weapons.exclude.has(id)) continue
    // Obtainable weapons have a lore entry; trial, quest and test copies do not.
    if (!included && num(weapon, 'storyId') === 0) continue
    const name = inputs.names.get(weapon.nameTextMapHash)
    if (!name) {
      if (included)
        problems.error(`Weapon ${id} is included in overrides/keys.json but has no name`)
      continue
    }
    const key = keys.weapons.key.get(id) ?? context.toGoodKey(name)
    const what = `Weapon ${key} (${id})`
    const rarity = num(weapon, 'rankLevel')
    const type = WEAPON_TYPES[str(weapon, 'weaponType')]
    if (rarity < 1 || rarity > 5) problems.error(`${what}: rarity ${rarity}`)
    if (!type) problems.error(`${what}: unknown weaponType "${str(weapon, 'weaponType')}"`)
    const promoteId = num(weapon, 'weaponPromoteId')
    const asc = ascension(
      `w${promoteId}`,
      weaponPromotes.get(promoteId),
      WEAPON_PROMOTE_SLOTS,
      'coinCost',
      what,
    )
    if (rarity < 1 || rarity > 5 || !type || !asc) continue
    ascensions.set(`w${promoteId}`, asc)
    weaponCandidates.push({ key, id, row: [key, id, rarity, type, `w${promoteId}`] })
  }

  const ascensionTables = ascensions.finish()
  const talentTables = talents.finish()
  const canonicalAscension = (key: string) => ascensionTables.canonical.get(key) ?? key
  const canonicalTalent = (key: string) => talentTables.canonical.get(key) ?? key

  const characters = resolveCollisions(
    'Character',
    characterCandidates.map((c) => {
      const r = c.row
      return {
        ...c,
        row: [
          r[0],
          r[1],
          r[2],
          r[3],
          r[4],
          canonicalAscension(r[5]),
          canonicalTalent(r[6]),
          canonicalTalent(r[7]),
          canonicalTalent(r[8]),
          r[9],
          r[10],
        ] as CharacterRow,
      }
    }),
    problems,
  )
  const weapons = resolveCollisions(
    'Weapon',
    weaponCandidates.map((c) => ({
      ...c,
      row: [...c.row.slice(0, 4), canonicalAscension(c.row[4])] as WeaponRow,
    })),
    problems,
  )

  // Keep only tables that a kept character or weapon uses.
  const usedAscensions = new Set([...characters.map((r) => r[5]), ...weapons.map((r) => r[4])])
  const usedTalents = new Set(characters.flatMap((r) => [r[6], r[7], r[8]]))
  const ascensionOut = Object.fromEntries(
    Object.entries(ascensionTables.tables).filter(([key]) => usedAscensions.has(key)),
  )
  const talentOut = Object.fromEntries(
    Object.entries(talentTables.tables).filter(([key]) => usedTalents.has(key)),
  )
  // Phase caps must match across characters; weapons of rarity 1-2 stop at 70.
  for (const r of characters) {
    const caps = (ascensionOut[r[5]] ?? []).map((p) => p[0]).join(',')
    if (caps !== '20,40,50,60,70,80,90')
      problems.error(`Character ${r[0]}: unusual level caps ${caps}`)
  }

  // --- Adventure Rank per ascension, ascension per talent level -------------
  const keptCharacters = new Set(characters.map((r) => r[0]))
  const keptWeapons = new Set(weapons.map((r) => r[0]))
  const characterAR = commonList(
    'Character ascension AR (requiredPlayerLevel)',
    characterCandidates
      .filter((c) => keptCharacters.has(c.key))
      .map((c) => [c.key, promoteAR.get(c.row[5]) ?? []] as const),
    problems,
  )
  const weaponAR = commonList(
    'Weapon ascension AR (requiredPlayerLevel)',
    weaponCandidates
      .filter((c) => keptWeapons.has(c.key))
      .map((c) => [c.key, promoteAR.get(c.row[4]) ?? []] as const),
    problems,
  )
  if (characterAR.length > 0 && !characterAR.slice(1).every((ar) => ar > 0)) {
    problems.error(
      `Character ascension AR ${characterAR.join(',')} has phases without an AR (requiredPlayerLevel renamed?)`,
    )
  }
  const talentAscension = commonList(
    'Talent ascension (ProudSkill breakLevel)',
    characterCandidates
      .filter((c) => keptCharacters.has(c.key))
      .flatMap((c) =>
        [c.row[6], c.row[7], c.row[8]].map(
          (group) =>
            [`${c.key} talent group ${group}`, talentBreaks.get(Number(group)) ?? []] as const,
        ),
      ),
    problems,
    true,
  )
  if (talentAscension.length !== 10 || talentAscension[9] === 0) {
    problems.error(
      `Talent ascension per level is ${talentAscension.join(',')}; expected 10 levels ending at phase 6 (breakLevel renamed?)`,
    )
  }

  // --- EXP ---------------------------------------------------------------
  const levels = [...inputs.avatarLevels].sort((a, b) => num(a, 'level') - num(b, 'level'))
  const characterExp = levels.map((r) => num(r, 'exp'))
  if (levels.some((r, i) => num(r, 'level') !== i + 1) || levels.length < LEVEL_CAP - 1) {
    problems.error(
      `AvatarLevelExcelConfigData: levels are not 1..${LEVEL_CAP} (${levels.length} rows)`,
    )
  }
  const weaponLevels = [...inputs.weaponLevels].sort((a, b) => num(a, 'level') - num(b, 'level'))
  const weaponExp = [1, 2, 3, 4, 5].map((rarity) =>
    weaponLevels.map((r) => Number(list<number>(r, 'requiredExps')[rarity - 1] ?? 0)),
  )
  if (
    weaponLevels.some((r, i) => num(r, 'level') !== i + 1) ||
    weaponExp.some((c) => c.slice(0, LEVEL_CAP - 1).some((e) => !(e > 0)))
  ) {
    problems.error('WeaponLevelExcelConfigData: levels are not 1..90 with an EXP value per rarity')
  }

  const expItems: { character: Cost[]; weapon: Cost[] } = { character: [], weapon: [] }
  for (const material of inputs.materials) {
    for (const itemUse of list(material, 'itemUse')) {
      const spec = EXP_ITEMS.find((e) => e.use === str(itemUse, 'useOp'))
      if (!spec || str(material, 'materialType') !== spec.type) continue
      const exp = Number(list<string>(itemUse, 'useParam')[0])
      const id = num(material, 'id')
      if (!(exp > 0)) {
        problems.error(`EXP item ${id} gives no EXP`)
        continue
      }
      expItems[spec.kind === 'exp' ? 'character' : 'weapon'].push([id, exp])
      use(id, spec.kind)
    }
  }
  for (const list of [expItems.character, expItems.weapon]) list.sort((a, b) => a[1] - b[1])
  if (expItems.character.length === 0 || expItems.weapon.length === 0) {
    problems.error('No character EXP books or weapon ores found (Material itemUse changed?)')
  }
  use(MORA, 'mora')
  // The conversion currencies: planner materials so item goals and tiles can name them.
  use(DREAM_SOLVENT, 'currency')
  use(DUST_OF_AZOTH, 'currency')

  // --- materials and families ---------------------------------------------
  const materialKeys = new Map<number, string>()
  const materialRows = new Map<number, MaterialRow>()
  const addMaterial = (id: number, kind: MaterialKind): MaterialRow | null => {
    const existing = materialRows.get(id)
    if (existing) return existing
    const material = materials.get(id)
    if (!material) {
      problems.error(`Material ${id} (${kind}) is not in MaterialExcelConfigData`)
      return null
    }
    const name = inputs.names.get(material.nameTextMapHash) ?? ''
    const key = keys.materials.key.get(id) ?? (name ? context.toGoodKey(name) : '')
    const icon = str(material, 'icon').trim()
    if (!key)
      problems.error(`Planner material ${id} has no name in TextMap_MediumEN, so no GOOD key`)
    if (!icon) problems.error(`Planner material ${id} (${key}) has no icon`)
    const row: MaterialRow = [id, key, name, num(material, 'rankLevel'), kind, icon]
    materialRows.set(id, row)
    materialKeys.set(id, key)
    return row
  }
  for (const [id, kinds] of usage) {
    if (kinds.size > 1) {
      problems.error(`Material ${id} is used as ${[...kinds].join(' and ')}; one kind expected`)
    }
    addMaterial(id, [...kinds][0]!)
  }
  if (materialRows.get(MORA)?.[2] !== 'Mora')
    problems.error(`Item ${MORA} is not named Mora any more`)

  const families = compileFamilies(inputs, context, materialRows, slotSequences, addMaterial)

  const itemKey = (id: number): string => {
    const known = materialKeys.get(id) ?? keys.materials.key.get(id)
    if (known) return known
    const name = inputs.names.get(materials.get(id)?.nameTextMapHash)
    return name ? context.toGoodKey(name) : ''
  }
  const farming = compileFarming(inputs, {
    problems,
    planner: context.planner,
    materialRows,
    families,
    characters,
    weapons,
    weaponOres: expItems.weapon.map(([id]) => id),
    itemKey,
  })

  // Every planner material key must be unique: inventories are keyed by it.
  const byKey = new Map<string, number>()
  for (const [id, row] of materialRows) {
    const other = byKey.get(row[1])
    if (other !== undefined && row[1]) {
      problems.error(
        `Planner materials ${other} and ${id} share the GOOD key "${row[1]}"; set one in overrides/keys.json materials.key`,
      )
    }
    byKey.set(row[1], id)
  }

  const planner: PlannerFile = {
    columns: {
      characters: CHARACTER_COLUMNS,
      weapons: WEAPON_COLUMNS,
      materials: MATERIAL_COLUMNS,
      families: FAMILY_COLUMNS,
      domains: DOMAIN_COLUMNS,
      weeklyBosses: WEEKLY_COLUMNS,
      forge: FORGE_COLUMNS,
    },
    levelCap: LEVEL_CAP,
    mora: MORA,
    moraPerExp: MORA_PER_EXP,
    characterExp,
    weaponExp,
    expItems,
    ascensions: sortedTables(ascensionOut),
    talents: sortedTables(talentOut),
    characters: characters.sort((a, b) => compareKeys(a[0], b[0])),
    weapons: weapons.sort((a, b) => compareKeys(a[0], b[0])),
    materials: [...materialRows.values()].sort((a, b) => a[0] - b[0]),
    families,
    promoteAR: { character: characterAR, weapon: weaponAR },
    talentAscension,
    ...farming.data,
  }
  return { planner, materialKeys, checks: farming.checks }
}

/**
 * The one list every entry should share (AR per ascension phase, ascension
 * per talent level). Shorter lists must be its start (1-2 star weapons have
 * fewer phases) unless `exact`; anything else is an error naming an example.
 */
function commonList(
  what: string,
  lists: readonly (readonly [string, readonly number[]])[],
  problems: Problems,
  exact = false,
): number[] {
  let longest: readonly number[] = []
  for (const [, list] of lists) if (list.length > longest.length) longest = list
  const odd = lists.filter(
    ([, list]) =>
      (exact && list.length !== longest.length) || list.some((value, i) => value !== longest[i]),
  )
  if (odd.length > 0) {
    problems.error(
      `${what} differs between entries (${odd.length}, e.g. ${odd[0]![0]}: ${odd[0]![1].join(',')} vs ${longest.join(',')}); ` +
        'store it per table in planner.json instead of one list',
    )
  }
  return [...longest]
}

function sortedTables<T>(tables: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(tables).sort(([a], [b]) => tableKeyOrder(a, b)))
}

/**
 * One row per GOOD key. Several game ids may produce a key (both Travelers,
 * quest copies): fine when their data is identical (the lowest id is kept),
 * an error otherwise.
 */
function resolveCollisions<R extends [string, number, ...unknown[]]>(
  what: string,
  candidates: Candidate<R>[],
  problems: Problems,
): R[] {
  const byKey = new Map<string, Candidate<R>[]>()
  for (const c of candidates) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c])
  const rows: R[] = []
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.id - b.id)
    const content = (c: Candidate<R>) => JSON.stringify(c.row.slice(2))
    const first = list[0]!
    if (list.some((c) => content(c) !== content(first))) {
      problems.error(
        `${what} GOOD key "${key}" comes from ids ${list.map((c) => c.id).join(', ')} with different data; ` +
          'exclude the wrong one in overrides/keys.json',
      )
      continue
    }
    rows.push(first.row)
  }
  return rows
}

function compileFamilies(
  inputs: PlannerInputs,
  context: PlannerContext,
  materialRows: Map<number, MaterialRow>,
  slotSequences: Map<number, number[]>,
  addMaterial: (id: number, kind: MaterialKind) => MaterialRow | null,
): FamilyRow[] {
  const { problems, weekdays } = context

  // Crafting: 3 of a tier -> 1 of the next.
  const up = new Map<number, { next: number; mora: number }>()
  const down = new Map<number, number>()
  for (const recipe of inputs.combines) {
    if (str(recipe, 'recipeType') !== 'RECIPE_TYPE_COMBINE') continue
    const inputsOf = costs(recipe, 'materialItems')
    const result = num(recipe, 'resultItemId')
    if (inputsOf.length !== 1 || inputsOf[0]!.count !== 3 || !result) continue
    if (num(recipe, 'resultItemCount') !== 1) continue
    up.set(inputsOf[0]!.id, { next: result, mora: num(recipe, 'scoinCost') })
    down.set(result, inputsOf[0]!.id)
  }

  const sources = new Map(inputs.materialSources.map((s) => [num(s, 'id'), s]))
  const dungeons = new Map(inputs.dungeons.map((d) => [num(d, 'id'), d]))
  const suggested = weekdaySuggestions(inputs.dungeonEntries)

  const assigned = new Map<number, string>()
  const families: FamilyRow[] = []
  const tiered = [...materialRows.values()]
    .filter((r) => TIERED.has(r[4]))
    .sort((a, b) => a[0] - b[0])
  for (const material of tiered) {
    const [id, , , , kind] = material
    if (assigned.has(id)) continue
    let members: number[]
    let craft: number[] = []
    if (up.has(id) || down.has(id)) {
      let root = id
      while (down.has(root)) root = down.get(root)!
      members = [root]
      for (let step = up.get(root); step; step = up.get(step.next)) {
        members.push(step.next)
        craft.push(step.mora)
      }
    } else if (slotSequences.has(id)) {
      // No recipe (Brilliant Diamond): the tiers as one ascension slot uses them.
      members = slotSequences.get(id)!
      craft = []
    } else {
      problems.error(
        `${kind} material ${id} (${material[1]}) belongs to no family (no Combine recipe or ascension tiers)`,
      )
      continue
    }

    const rows = members.map((m) => addMaterial(m, kind))
    if (rows.some((r) => !r)) continue
    const memberRows = rows as MaterialRow[]
    const familyKey = memberRows[0]![1]
    for (const row of memberRows) {
      if (row[4] !== kind)
        problems.error(`Family ${familyKey}: ${row[1]} is ${row[4]}, not ${kind}`)
      const other = assigned.get(row[0])
      if (other) problems.error(`Material ${row[1]} is in families ${other} and ${familyKey}`)
      assigned.set(row[0], familyKey)
    }
    for (let i = 1; i < memberRows.length; i++) {
      if (memberRows[i]![3] <= memberRows[i - 1]![3]) {
        problems.warn(
          `Family ${familyKey}: rarity does not rise from ${memberRows[i - 1]![1]} to ${memberRows[i]![1]}`,
        )
      }
    }

    let domain = ''
    let days: number[] = []
    if (kind === 'book' || kind === 'weapon') {
      const source = sources.get(members[0]!)
      const dungeonId =
        list<number>(source ?? {}, 'dungeonGroup')[0] ||
        list<number>(source ?? {}, 'dungeonList')[0]
      domain = (dungeonId && inputs.text.get(dungeons.get(dungeonId)?.displayNameTextMapHash)) || ''
      if (!domain)
        problems.warn(`Family ${familyKey}: no domain name found (MaterialSourceData -> Dungeon)`)

      // overrides/weekdays.json wins (checked in game); else the game's own
      // domain reward list; the two are compared whenever both exist.
      const section = kind === 'book' ? 'talentBooks' : 'weaponMaterials'
      const set = weekdays[section].get(familyKey)
      const hint = members.map((m) => suggested.get(m)).find(Boolean)
      const chosen = set ?? hint
      if (!chosen) {
        problems.error(
          `${kind === 'book' ? 'Talent book' : 'Weapon material'} family ${familyKey} has no domain days ` +
            "(not in overrides/weekdays.json, not in the game's domain reward list): add " +
            `"${familyKey}": "mon-thu | tue-fri | wed-sat" to overrides/weekdays.json ${section}`,
        )
      } else {
        days = [...WEEKDAY_SETS[chosen]]
        if (!set) {
          problems.warn(
            `Family ${familyKey}: domain days ${hint} taken from the game's domain reward list; ` +
              `confirm them in game and add "${familyKey}": "${hint}" to overrides/weekdays.json ${section}`,
          )
        } else if (hint && hint !== set) {
          problems.warn(
            `Family ${familyKey}: weekdays.json says ${set}, the game's domain reward list says ${hint} (weekdays.json wins)`,
          )
        }
      }
    }
    families.push([familyKey, kind, members, craft, domain, days])
  }

  // Overrides that match nothing are probably typos.
  const familyKeys = new Set(families.map((f) => f[0]))
  for (const section of ['talentBooks', 'weaponMaterials'] as const) {
    for (const key of weekdays[section].keys()) {
      if (!familyKeys.has(key))
        problems.warn(`overrides/weekdays.json ${section}.${key} matches no family`)
    }
  }
  return families.sort((a, b) => a[2][0]! - b[2][0]!)
}

/**
 * Item id -> weekday set from DungeonEntry `descriptionCycleRewardList`
 * (Mon/Thu, Tue/Fri, Wed/Sat, then everything for Sunday). Only a hint for
 * maintainers and a cross-check: the field may be renamed any version.
 */
function weekdaySuggestions(entries: Row[]): Map<number, WeekdaySet> {
  const map = new Map<number, WeekdaySet>()
  for (const entry of entries) {
    const cycle = list<number[]>(entry, 'descriptionCycleRewardList')
    if (cycle.length < 3) continue
    CYCLE_DAYS.forEach((days, index) => {
      for (const id of cycle[index] ?? []) if (typeof id === 'number' && id > 0) map.set(id, days)
    })
  }
  return map
}

function checkInputs(inputs: PlannerInputs, problems: Problems): void {
  checkFields(problems, 'AvatarExcelConfigData', inputs.avatars, {
    id: 0.99,
    nameTextMapHash: 0.99,
    qualityType: 0.9,
    weaponType: 0.9,
    useType: 0.5,
    skillDepotId: 0.9,
    candSkillDepotIds: 2,
    avatarPromoteId: 0.9,
    featureTagGroupID: 0.9,
  })
  checkFields(problems, 'AvatarSkillDepotExcelConfigData', inputs.depots, {
    id: 0.99,
    skills: 0.9,
    energySkill: 0.5,
  })
  checkFields(problems, 'AvatarSkillExcelConfigData', inputs.skills, {
    id: 0.99,
    proudSkillGroupId: 0.1,
    costElemType: 0.05,
  })
  checkFields(problems, 'ProudSkillExcelConfigData', inputs.proudSkills, {
    proudSkillGroupId: 0.99,
    level: 0.9,
    costItems: 0.9,
    coinCost: 0.2,
  })
  checkFields(problems, 'AvatarPromoteExcelConfigData', inputs.avatarPromotes, {
    avatarPromoteId: 0.99,
    promoteLevel: 0.5,
    costItems: 0.9,
    scoinCost: 0.5,
    unlockMaxLevel: 0.9,
  })
  checkFields(problems, 'AvatarLevelExcelConfigData', inputs.avatarLevels, {
    level: 0.99,
    exp: 0.9,
  })
  checkFields(problems, 'WeaponExcelConfigData', inputs.weapons, {
    id: 0.99,
    nameTextMapHash: 0.99,
    rankLevel: 0.9,
    weaponType: 0.9,
    weaponPromoteId: 0.9,
    storyId: 0.5,
  })
  checkFields(problems, 'WeaponPromoteExcelConfigData', inputs.weaponPromotes, {
    weaponPromoteId: 0.99,
    promoteLevel: 0.5,
    costItems: 0.9,
    coinCost: 0.5,
    unlockMaxLevel: 0.9,
  })
  checkFields(problems, 'WeaponLevelExcelConfigData', inputs.weaponLevels, {
    level: 0.99,
    requiredExps: 0.9,
  })
  checkFields(problems, 'MaterialExcelConfigData', inputs.materials, {
    id: 0.99,
    nameTextMapHash: 0.9,
    icon: 0.9,
    materialType: 0.9,
    rankLevel: 0.5,
    itemUse: 0.5,
  })
  checkFields(problems, 'MaterialSourceDataExcelConfigData', inputs.materialSources, {
    id: 0.99,
    dungeonGroup: 50,
  })
  checkFields(problems, 'DungeonExcelConfigData', inputs.dungeons, {
    id: 0.99,
    displayNameTextMapHash: 0.5,
  })
  checkFields(problems, 'CombineExcelConfigData', inputs.combines, {
    recipeType: 0.9,
    resultItemId: 0.9,
    resultItemCount: 0.9,
    materialItems: 0.9,
    scoinCost: 0.2,
  })
  // The domain entries (farming.ts) are built from it.
  checkFields(problems, 'DungeonEntryExcelConfigData', inputs.dungeonEntries, {
    id: 0.99,
    type: 0.9,
    descriptionCycleRewardList: 10,
  })
  checkFields(problems, 'AvatarPromoteExcelConfigData', inputs.avatarPromotes, {
    requiredPlayerLevel: 0.5,
  })
  checkFields(problems, 'WeaponPromoteExcelConfigData', inputs.weaponPromotes, {
    requiredPlayerLevel: 0.5,
  })
  checkFields(problems, 'ProudSkillExcelConfigData', inputs.proudSkills, {
    breakLevel: 1000,
    lifeEffectType: 20,
    lifeEffectParams: 0.5,
  })
}
