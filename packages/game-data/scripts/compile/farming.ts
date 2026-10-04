/**
 * Planner data beyond costs: where materials are farmed and what can be
 * converted, forged or saved. Called from compilePlanner, which has already
 * built the materials and families.
 *
 * Sources (ExcelBinOutput):
 * - DungeonEntry `descriptionCycleRewardList` (talent/weapon entrances): the
 *   three families of each entrance in day order (Mon/Thu, Tue/Fri, Wed/Sat,
 *   then all of them for Sunday). MaterialSourceData `dungeonGroup` -> Dungeon
 *   (`limitLevel`, `statueCost*`) -> RewardPreview: each tier's AR, resin,
 *   Mora and previewed lowest-tier average. Entrance names are not linked in
 *   the tables: overrides/planner.json `domainNames`.
 * - Combine `RECIPE_TYPE_CONVERT`: Dream Solvent trios (union of the
 *   source/result pairs; weekly boss materials and billets) and Dust of
 *   Azoth gem conversions (dust per tier).
 * - Dungeon `DUNGEON_BOSS` + RewardPreview: which boss levels (and ARs) drop
 *   each weekly trio; `previewMonsterList` -> Monster -> MonsterDescribe: the
 *   boss name. Bosses outside domains (Andrius) are named in
 *   overrides/planner.json `weeklyBossNames`.
 * - Forge: weapon EXP ore recipes. BlossomChest: ley line resin. Material
 *   `itemUse` / Combine: what each resin item holds.
 * - AvatarSkillDepot (any field listing `proudSkillGroupId`) -> ProudSkill
 *   `lifeEffectType`: utility passives (weapon ascension Mora, crafting).
 */

import type {
  CharacterRow,
  DomainKind,
  DomainRow,
  DomainTierRow,
  FamilyRow,
  ForgeRow,
  MaterialKind,
  MaterialRow,
  PlannerFile,
  WeaponRow,
  WeaponType,
  WeeklyBossRow,
} from '../../src/format.ts'
import { checkFields, list, num, str, type Row, type TextMap } from '../lib/excel.ts'
import type { PlannerOverride } from '../lib/overrides.ts'
import type { Problems } from '../lib/problems.ts'

export const FARMING_FILES = {
  rewardPreviews: 'ExcelBinOutput/RewardPreviewExcelConfigData.json',
  forges: 'ExcelBinOutput/ForgeExcelConfigData.json',
  blossomChests: 'ExcelBinOutput/BlossomChestExcelConfigData.json',
  monsters: 'ExcelBinOutput/MonsterExcelConfigData.json',
  monsterDescribes: 'ExcelBinOutput/MonsterDescribeExcelConfigData.json',
} as const

/** Fixed item ids (stable since 1.x; the names are checked). */
const ORIGINAL_RESIN = 106
export const DREAM_SOLVENT = 113021
export const DUST_OF_AZOTH = 104201
const MORA = 202

const ENTRY_KINDS: Record<string, DomainKind> = {
  DUNGEN_ENTRY_TYPE_AVATAR_TALENT: 'talent',
  DUNGEN_ENTRY_TYPE_WEAPON_PROMOTE: 'weapon',
}
const FAMILY_KIND: Record<DomainKind, MaterialKind> = { talent: 'book', weapon: 'weapon' }

/** The game's WeaponType enum values, as utility passives list them. */
const WEAPON_TYPE_IDS: Record<number, WeaponType> = {
  1: 'sword',
  10: 'catalyst',
  11: 'claymore',
  12: 'bow',
  13: 'polearm',
}
const LEY_LINES = ['BLOSSOM_REFRESH_SCOIN', 'BLOSSOM_REFRESH_EXP']

export interface FarmingInputs {
  dungeons: Row[]
  dungeonEntries: Row[]
  materialSources: Row[]
  materials: Row[]
  combines: Row[]
  avatars: Row[]
  depots: Row[]
  proudSkills: Row[]
  weapons: Row[]
  rewardPreviews: Row[]
  forges: Row[]
  blossomChests: Row[]
  monsters: Row[]
  monsterDescribes: Row[]
  /** TextMap_MediumEN + TextMapEN, for names. */
  text: TextMap
}

export interface FarmingContext {
  problems: Problems
  planner: PlannerOverride
  materialRows: ReadonlyMap<number, MaterialRow>
  families: readonly FamilyRow[]
  characters: readonly CharacterRow[]
  weapons: readonly WeaponRow[]
  /** Weapon EXP ore item ids. */
  weaponOres: readonly number[]
  /** GOOD key of any item ('' when it has no name). */
  itemKey: (id: number) => string
}

export type FarmingData = Pick<
  PlannerFile,
  | 'domains'
  | 'weeklyBosses'
  | 'unfarmable'
  | 'billets'
  | 'items'
  | 'azoth'
  | 'forge'
  | 'weaponBaseExp'
  | 'resin'
  | 'passives'
>

/** A RewardPreview row as [item id, count] (count 0 when the preview shows none). */
function previewOf(previews: Map<number, Row>, id: number): [number, number][] {
  return list(previews.get(id) ?? {}, 'previewItems')
    .map((item): [number, number] => [num(item, 'id'), num(item, 'count')])
    .filter(([itemId]) => itemId > 0)
}

export interface CompiledFarming {
  data: FarmingData
  /** Game values the build compares with overrides/drops.json (not written to data/). */
  checks: { solventPerRun: number[] }
}

export function compileFarming(inputs: FarmingInputs, context: FarmingContext): CompiledFarming {
  const { problems } = context
  checkInputs(inputs, problems)
  const previews = new Map(inputs.rewardPreviews.map((r) => [num(r, 'id'), r]))
  const materials = new Map(inputs.materials.map((m) => [num(m, 'id'), m]))
  const name = (id: number) => inputs.text.get(materials.get(id)?.nameTextMapHash) ?? ''
  for (const [id, expected] of [
    [ORIGINAL_RESIN, 'Original Resin'],
    [DREAM_SOLVENT, 'Dream Solvent'],
    [DUST_OF_AZOTH, 'Dust of Azoth'],
  ] as const) {
    if (name(id) !== expected)
      problems.error(`Item ${id} is not named ${expected} any more ("${name(id)}")`)
  }
  const familyOf = new Map<number, FamilyRow>()
  for (const family of context.families) for (const id of family[2]) familyOf.set(id, family)

  const conversions = compileConversions(inputs, context, previews, familyOf)
  const data: FarmingData = {
    domains: compileDomains(inputs, context, previews, familyOf),
    ...conversions.data,
    items: {
      dreamSolvent: context.itemKey(DREAM_SOLVENT),
      dustOfAzoth: context.itemKey(DUST_OF_AZOTH),
    },
    forge: compileForge(inputs, context),
    weaponBaseExp: compileWeaponBaseExp(inputs, context),
    resin: compileResin(inputs, context),
    passives: compilePassives(inputs, context, familyOf),
  }
  return { data, checks: { solventPerRun: conversions.solventPerRun } }
}

// --- Domains ------------------------------------------------------------------

function compileDomains(
  inputs: FarmingInputs,
  context: FarmingContext,
  previews: Map<number, Row>,
  familyOf: Map<number, FamilyRow>,
): DomainRow[] {
  const { problems } = context
  const sources = new Map(inputs.materialSources.map((s) => [num(s, 'id'), s]))
  const dungeons = new Map(inputs.dungeons.map((d) => [num(d, 'id'), d]))
  const gameText = textValues(inputs.text, context.planner.domainNames.values())

  const domains: DomainRow[] = []
  const placed = new Map<string, number>()
  for (const entry of inputs.dungeonEntries) {
    const kind = ENTRY_KINDS[str(entry, 'type')]
    if (!kind) continue
    const id = num(entry, 'id')
    const cycle = list<number[]>(entry, 'descriptionCycleRewardList')
    const families: string[] = []
    for (let day = 0; day < 3; day++) {
      const found = new Set(
        (cycle[day] ?? [])
          .map((item) => familyOf.get(item))
          .filter((f): f is FamilyRow => f?.[1] === FAMILY_KIND[kind])
          .map((f) => f[0]),
      )
      if (found.size !== 1) {
        problems.error(
          `Domain entry ${id} (${kind}): day ${day + 1} of its reward list names ${found.size} families (${[...found].join(', ') || 'none'}); expected one`,
        )
        continue
      }
      families.push([...found][0]!)
    }
    if (families.length !== 3) continue

    // Tiers, from each family's own single-family domain (MaterialSourceData dungeonGroup).
    const tierLists = families.map((key) => {
      const family = context.families.find((f) => f[0] === key)!
      const lowest = family[2][0]!
      const group = list<number>(sources.get(lowest) ?? {}, 'dungeonGroup').filter((d) => d > 0)
      const tiers = group
        .map((d) => dungeons.get(d))
        .filter((d): d is Row => d !== undefined)
        .sort((a, b) => num(a, 'limitLevel') - num(b, 'limitLevel'))
        .map((d): DomainTierRow => {
          const preview = previewOf(previews, num(d, 'passRewardPreviewID'))
          if (num(d, 'statueCostID') !== ORIGINAL_RESIN) {
            problems.error(
              `Domain ${num(d, 'id')} (${key}): a run costs item ${num(d, 'statueCostID')}, not Original Resin`,
            )
          }
          return [
            num(d, 'limitLevel'),
            num(d, 'statueCostCount'),
            preview.find(([item]) => item === MORA)?.[1] ?? 0,
            preview.find(([item]) => item === lowest)?.[1] ?? 0,
          ]
        })
      return { key, tiers }
    })
    const [first] = tierLists
    if (!first || first.tiers.length === 0) {
      problems.error(
        `Domain entry ${id} (${families.join(', ')}): no tiers found (MaterialSourceData dungeonGroup -> Dungeon)`,
      )
      continue
    }
    for (const other of tierLists.slice(1)) {
      if (JSON.stringify(other.tiers) !== JSON.stringify(first.tiers)) {
        problems.warn(
          `Domain entry ${id}: ${other.key}'s tiers ${JSON.stringify(other.tiers)} differ from ${first.key}'s ${JSON.stringify(first.tiers)}; using ${first.key}'s`,
        )
      }
    }
    const tiers = first.tiers
    if (
      tiers.some(
        ([ar, resin, mora], i) =>
          !(ar > 0 && resin > 0 && mora > 0) || (i > 0 && ar < tiers[i - 1]![0]),
      )
    ) {
      problems.error(
        `Domain entry ${id}: tiers ${JSON.stringify(tiers)} need a rising AR, resin and Mora`,
      )
    }

    const name = context.planner.domainNames.get(families[0]!) ?? ''
    if (!name) {
      problems.warn(
        `Domain entry ${id} (${families.join(', ')}) has no name: add "${families[0]}": "<entrance name>" to overrides/planner.json domainNames`,
      )
    } else if (!gameText.has(name)) {
      problems.warn(
        `overrides/planner.json domainNames.${families[0]} "${name}" is not in the game's text`,
      )
    }
    for (const key of families) {
      const other = placed.get(key)
      if (other !== undefined)
        problems.error(`Family ${key} is in domain entries ${other} and ${id}`)
      placed.set(key, id)
    }
    domains.push([id, kind, name, families, tiers])
  }

  for (const family of context.families) {
    if ((family[1] === 'book' || family[1] === 'weapon') && !placed.has(family[0])) {
      problems.error(
        `${family[1] === 'book' ? 'Talent book' : 'Weapon material'} family ${family[0]} is in no domain entry (DungeonEntry descriptionCycleRewardList)`,
      )
    }
  }
  const named = new Set(domains.map((d) => d[3][0]))
  for (const key of context.planner.domainNames.keys()) {
    if (!named.has(key))
      problems.warn(`overrides/planner.json domainNames.${key} matches no domain entry`)
  }
  return domains.sort((a, b) => a[0] - b[0])
}

/** The subset of `names` that appear somewhere in the game's text. */
function textValues(text: TextMap, names: Iterable<string>): Set<string> {
  const wanted = new Set(names)
  const found = new Set<string>()
  if (wanted.size === 0) return found
  for (const value of text.values()) if (wanted.has(value)) found.add(value)
  return found
}

// --- Dream Solvent, weekly bosses, Dust of Azoth ---------------------------------

function compileConversions(
  inputs: FarmingInputs,
  context: FarmingContext,
  previews: Map<number, Row>,
  familyOf: Map<number, FamilyRow>,
): {
  data: Pick<FarmingData, 'weeklyBosses' | 'unfarmable' | 'billets' | 'azoth'>
  solventPerRun: number[]
} {
  const { problems, materialRows } = context
  const converts = inputs.combines.filter((c) => str(c, 'recipeType') === 'RECIPE_TYPE_CONVERT')
  const inputsOf = (recipe: Row) =>
    list(recipe, 'materialItems')
      .map((m) => ({ id: num(m, 'id'), count: num(m, 'count') }))
      .filter((m) => m.id > 0 && m.count > 0)

  // Dream Solvent: union-find over source <-> result.
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!
    parent.set(x, root)
    return root
  }
  const cost = new Map<number, number>()
  for (const recipe of converts) {
    const items = inputsOf(recipe)
    const solvent = items.find((m) => m.id === DREAM_SOLVENT)
    if (!solvent) continue
    const source = items.find((m) => m.id !== DREAM_SOLVENT)
    const result = num(recipe, 'resultItemId')
    if (!source || !result || source.count !== 1 || num(recipe, 'resultItemCount') !== 1) {
      problems.warn(`Dream Solvent recipe -> ${result} is not 1 item + solvent -> 1 item; skipped`)
      continue
    }
    for (const id of [source.id, result]) if (!parent.has(id)) parent.set(id, id)
    parent.set(find(source.id), find(result))
    cost.set(result, solvent.count)
  }
  const trios = new Map<number, number[]>()
  for (const id of parent.keys()) {
    const root = find(id)
    trios.set(root, [...(trios.get(root) ?? []), id])
  }

  const weekly: { items: number[]; solvent: number }[] = []
  const billets: [number[], number][] = []
  for (const members of trios.values()) {
    members.sort((a, b) => a - b)
    const costs = new Set(members.map((id) => cost.get(id) ?? 0))
    if (costs.size !== 1 || costs.has(0)) {
      problems.error(
        `Dream Solvent group ${members.join(', ')}: conversions cost ${[...costs].join('/')} solvent`,
      )
      continue
    }
    const solvent = [...costs][0]!
    const kinds = new Set(members.map((id) => materialRows.get(id)?.[4] ?? 'none'))
    if (kinds.size === 1 && kinds.has('weekly')) {
      weekly.push({ items: members, solvent })
    } else if (kinds.size === 1 && kinds.has('none')) {
      billets.push([members, solvent])
    } else {
      problems.error(
        `Dream Solvent group ${members.join(', ')} mixes planner weekly materials with other items (${[...kinds].join(', ')})`,
      )
    }
  }
  if (weekly.length === 0) problems.error('No Dream Solvent trios of weekly boss materials found')

  // Weekly bosses: which boss levels drop each trio, and the boss's name.
  const monsters = new Map(inputs.monsters.map((m) => [num(m, 'id'), m]))
  const describes = new Map(inputs.monsterDescribes.map((m) => [num(m, 'id'), m]))
  const trioOf = new Map<number, (typeof weekly)[number]>()
  for (const trio of weekly) for (const id of trio.items) trioOf.set(id, trio)
  const found = new Map<(typeof weekly)[number], { tiers: Set<string>; names: Set<string> }>()
  const solventPerRun = new Set<number>()
  for (const dungeon of inputs.dungeons) {
    if (str(dungeon, 'type') !== 'DUNGEON_BOSS') continue
    const items = previewOf(previews, num(dungeon, 'passRewardPreviewID'))
    const solvent = items.find(([id]) => id === DREAM_SOLVENT)?.[1]
    if (solvent) solventPerRun.add(solvent)
    const trio = items.map(([id]) => trioOf.get(id)).find(Boolean)
    if (!trio) continue
    const info = found.get(trio) ?? { tiers: new Set<string>(), names: new Set<string>() }
    found.set(trio, info)
    info.tiers.add(`${num(dungeon, 'limitLevel')}:${num(dungeon, 'showLevel')}`)
    for (const monsterId of list<number>(dungeon, 'previewMonsterList')) {
      const describe = describes.get(num(monsters.get(monsterId) ?? {}, 'describeId'))
      const monsterName = inputs.text.get(describe?.nameTextMapHash)
      if (monsterName) info.names.add(monsterName)
    }
    if (info.names.size === 0) {
      const dungeonName = (inputs.text.get(dungeon.nameTextMapHash) ?? '')
        .replace(/^(Memories|Reflection): /, '')
        .replace(/ [IVX]+$/, '')
      if (dungeonName) info.names.add(dungeonName)
    }
  }
  const weeklyBosses: WeeklyBossRow[] = []
  const key = (id: number) => materialRows.get(id)?.[1] ?? String(id)
  for (const trio of weekly) {
    const info = found.get(trio)
    const first = key(trio.items[0]!)
    const name = context.planner.weeklyBossNames.get(first) ?? [...(info?.names ?? [])].join(' & ')
    if (!name) {
      problems.error(
        `Weekly trio ${trio.items.map(key).join(', ')} has no boss name: add "${first}": "<boss>" to overrides/planner.json weeklyBossNames`,
      )
    }
    const tiers = [...(info?.tiers ?? [])]
      .map((t) => t.split(':').map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    weeklyBosses.push([trio.items, trio.solvent, name, tiers])
  }
  weeklyBosses.sort((a, b) => a[0][0]! - b[0][0]!)

  // Every weekly material is in a trio, or explicitly unfarmable.
  const unfarmable: string[] = []
  for (const row of materialRows.values()) {
    if (row[4] !== 'weekly' || trioOf.has(row[0])) continue
    if (context.planner.unfarmable.has(row[1])) unfarmable.push(row[1])
    else {
      problems.error(
        `Weekly material ${row[1]} (${row[0]}) is in no Dream Solvent trio: add it to overrides/planner.json unfarmable with the reason, or fix the trio`,
      )
    }
  }
  for (const k of context.planner.unfarmable.keys()) {
    const row = [...materialRows.values()].find((r) => r[1] === k)
    if (!row || row[4] !== 'weekly' || trioOf.has(row[0]))
      problems.warn(
        `overrides/planner.json unfarmable.${k} is not a weekly material outside every trio`,
      )
  }
  for (const k of context.planner.weeklyBossNames.keys()) {
    if (!weeklyBosses.some((b) => key(b[0][0]!) === k))
      problems.warn(`overrides/planner.json weeklyBossNames.${k} matches no weekly trio`)
  }

  // Dust of Azoth: 1 gem + dust -> 1 gem of another element, same tier.
  const dustByTier = new Map<number, Set<number>>()
  const asSource = new Set<string>()
  const asResult = new Set<string>()
  for (const recipe of converts) {
    const items = inputsOf(recipe)
    const dust = items.find((m) => m.id === DUST_OF_AZOTH)
    if (!dust) continue
    const source = items.find((m) => m.id !== DUST_OF_AZOTH)
    const result = num(recipe, 'resultItemId')
    const from = source && familyOf.get(source.id)
    const to = familyOf.get(result)
    const fromRow = source && materialRows.get(source.id)
    const toRow = materialRows.get(result)
    if (!from || !to || !fromRow || !toRow || from[1] !== 'gem' || to[1] !== 'gem') {
      problems.warn(`Dust of Azoth recipe ${source?.id} -> ${result} is not gem -> gem; skipped`)
      continue
    }
    const tier = from[2].indexOf(source.id) + 1
    if (
      tier !== to[2].indexOf(result) + 1 ||
      source.count !== 1 ||
      num(recipe, 'resultItemCount') !== 1
    ) {
      problems.error(`Dust of Azoth recipe ${fromRow[1]} -> ${toRow[1]} changes tier or count`)
      continue
    }
    dustByTier.set(tier, (dustByTier.get(tier) ?? new Set()).add(dust.count))
    asSource.add(from[0])
    asResult.add(to[0])
  }
  const tiers = Math.max(0, ...dustByTier.keys())
  const dust: number[] = []
  for (let tier = 1; tier <= tiers; tier++) {
    const values = [...(dustByTier.get(tier) ?? [])]
    if (values.length !== 1)
      problems.error(`Dust of Azoth tier ${tier} costs ${values.join('/') || 'nothing'}`)
    dust.push(values[0] ?? 0)
  }
  const azothFamilies = [...asSource].filter((k) => asResult.has(k)).sort()
  if (azothFamilies.length !== asSource.size || azothFamilies.length !== asResult.size) {
    problems.error('Dust of Azoth: some gem families convert only one way')
  }
  if (azothFamilies.length < 2) problems.error('No Dust of Azoth gem conversions found')

  return {
    data: {
      weeklyBosses,
      unfarmable: unfarmable.sort(),
      billets: billets.sort((a, b) => a[0][0]! - b[0][0]!),
      azoth: { dust, families: azothFamilies },
    },
    solventPerRun: [...solventPerRun].sort(),
  }
}

// --- Forging, weapon fodder, resin ---------------------------------------------------

function compileForge(inputs: FarmingInputs, context: FarmingContext): ForgeRow[] {
  const { problems } = context
  const ores = new Set(context.weaponOres)
  const rows: ForgeRow[] = []
  for (const recipe of inputs.forges) {
    const result = num(recipe, 'resultItemId')
    if (!ores.has(result) || num(recipe, 'resultItemCount') !== 1) continue
    const items = list(recipe, 'materialItems')
      .map((m) => ({ id: num(m, 'id'), count: num(m, 'count') }))
      .filter((m) => m.id > 0 && m.count > 0)
    // Single-input recipes only (the resin recipe needs Original Resin too).
    if (items.length !== 1) continue
    const input = context.itemKey(items[0]!.id)
    if (!input) {
      problems.error(`Forge recipe ${num(recipe, 'id')}: input ${items[0]!.id} has no GOOD key`)
      continue
    }
    rows.push([
      context.itemKey(result),
      input,
      items[0]!.count,
      num(recipe, 'scoinCost'),
      num(recipe, 'forgeTime'),
    ])
  }
  const top = context.itemKey(context.weaponOres.at(-1) ?? 0)
  if (!rows.some((r) => r[0] === top))
    problems.error(`No forge recipe makes ${top} from one material`)
  return rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
}

function compileWeaponBaseExp(inputs: FarmingInputs, context: FarmingContext): number[] {
  const byId = new Map(inputs.weapons.map((w) => [num(w, 'id'), w]))
  const values = [1, 2, 3, 4, 5].map(() => new Map<number, number>())
  for (const [, id, rarity] of context.weapons) {
    const exp = num(byId.get(id) ?? {}, 'weaponBaseExp')
    const counts = values[rarity - 1]!
    counts.set(exp, (counts.get(exp) ?? 0) + 1)
  }
  return values.map((counts, i) => {
    const sorted = [...counts].sort((a, b) => b[1] - a[1])
    if (sorted.length > 1) {
      context.problems.warn(
        `Weapon base EXP of ${i + 1}-star weapons differs (${sorted.map(([e, n]) => `${e}×${n}`).join(', ')}); using the most common`,
      )
    }
    return sorted[0]?.[0] ?? 0
  })
}

function compileResin(inputs: FarmingInputs, context: FarmingContext): FarmingData['resin'] {
  const { problems } = context
  const items: [string, number][] = []
  for (const material of inputs.materials) {
    for (const use of list(material, 'itemUse')) {
      const params = list<string>(use, 'useParam')
      if (str(use, 'useOp') !== 'ITEM_USE_ADD_ITEM' || Number(params[0]) !== ORIGINAL_RESIN)
        continue
      const key = context.itemKey(num(material, 'id'))
      const amount = Number(params[1])
      if (key && amount > 0) items.push([key, amount])
    }
  }
  // Condensed Resin: the one item crafted from Original Resin (used for a double reward).
  const crafted = inputs.combines.filter(
    (recipe) =>
      str(recipe, 'recipeType') === 'RECIPE_TYPE_COMBINE' &&
      list(recipe, 'materialItems').some((m) => num(m, 'id') === ORIGINAL_RESIN),
  )
  let condensed: [string, number] = ['', 0]
  if (crafted.length !== 1) {
    problems.error(
      `${crafted.length} recipes craft from Original Resin; expected one (Condensed Resin)`,
    )
  } else {
    const recipe = crafted[0]!
    const resin = list(recipe, 'materialItems').find((m) => num(m, 'id') === ORIGINAL_RESIN)!
    const id = num(recipe, 'resultItemId')
    const material = inputs.materials.find((m) => num(m, 'id') === id)
    condensed = [context.itemKey(id), num(material ?? {}, 'stackLimit')]
    items.push([condensed[0], num(resin, 'count') / Math.max(1, num(recipe, 'resultItemCount'))])
  }
  if (!condensed[0] || !(condensed[1] > 0))
    problems.error('Condensed Resin has no GOOD key or stack limit')
  if (items.length < 2)
    problems.error(
      `Only ${items.length} resin items found (Material itemUse ITEM_USE_ADD_ITEM 106)`,
    )

  const leyLine = new Set(
    inputs.blossomChests
      .filter((b) => LEY_LINES.includes(str(b, 'refreshType')))
      .map((b) => num(b, 'resin')),
  )
  if (leyLine.size !== 1 || leyLine.has(0))
    problems.error(
      `Ley Line Outcrop resin is ${[...leyLine].join('/') || 'missing'} (BlossomChest)`,
    )
  return {
    original: context.itemKey(ORIGINAL_RESIN),
    items: items.sort((a, b) => a[0].localeCompare(b[0])),
    condensed,
    leyLine: [...leyLine][0] ?? 0,
  }
}

// --- Passives ------------------------------------------------------------------

function compilePassives(
  inputs: FarmingInputs,
  context: FarmingContext,
  familyOf: Map<number, FamilyRow>,
): FarmingData['passives'] {
  const { problems } = context
  // Character keys by avatar id (Travelers have one per element: left out).
  const keyOf = new Map<number, string>()
  for (const [key, id] of context.characters) if (!key.startsWith('Traveler')) keyOf.set(id, key)
  const avatarOfDepot = new Map<number, number>()
  for (const avatar of inputs.avatars) {
    const id = num(avatar, 'id')
    if (!keyOf.has(id)) continue
    for (const depot of [
      num(avatar, 'skillDepotId'),
      ...list<number>(avatar, 'candSkillDepotIds'),
    ]) {
      if (depot > 0) avatarOfDepot.set(depot, id)
    }
  }
  // Passive groups a depot opens: any list field of objects with proudSkillGroupId
  // (the field itself is obfuscated in recent dumps).
  const avatarOfGroup = new Map<number, number>()
  for (const depot of inputs.depots) {
    const avatar = avatarOfDepot.get(num(depot, 'id'))
    if (!avatar) continue
    for (const value of Object.values(depot)) {
      if (!Array.isArray(value)) continue
      for (const item of value) {
        if (item && typeof item === 'object' && 'proudSkillGroupId' in item) {
          avatarOfGroup.set(num(item as Row, 'proudSkillGroupId'), avatar)
        }
      }
    }
  }
  // Crafting categories (Combine combineType) -> the family kinds they craft.
  const kindsOfCombine = new Map<number, Set<MaterialKind>>()
  for (const recipe of inputs.combines) {
    if (str(recipe, 'recipeType') !== 'RECIPE_TYPE_COMBINE') continue
    const source = list(recipe, 'materialItems')
      .map((m) => num(m, 'id'))
      .find((id) => id > 0)
    const family = source ? familyOf.get(source) : undefined
    if (!family) continue
    const type = num(recipe, 'combineType')
    kindsOfCombine.set(type, (kindsOfCombine.get(type) ?? new Set()).add(family[1]))
  }

  const ascensionMora: FarmingData['passives']['ascensionMora'] = []
  const crafting: FarmingData['passives']['crafting'] = []
  const seen = new Set<number>()
  for (const skill of inputs.proudSkills) {
    const type = str(skill, 'lifeEffectType')
    if (!type) continue
    const group = num(skill, 'proudSkillGroupId')
    const avatar = avatarOfGroup.get(group)
    const character = avatar ? keyOf.get(avatar) : undefined
    if (!character || seen.has(group)) continue
    seen.add(group)
    const params = list<string>(skill, 'lifeEffectParams')
    if (type === 'PROUD_EFFECT_WEAPON_PROMOTE_REDUCE_SCOIN') {
      const types = String(params[0] ?? '')
        .split(',')
        .map((t) => WEAPON_TYPE_IDS[Number(t)])
      const saved = Number(params[1])
      if (types.some((t) => !t) || !(saved > 0 && saved <= 1)) {
        problems.error(
          `${character}'s ascension Mora passive has unknown params ${JSON.stringify(params)}`,
        )
        continue
      }
      ascensionMora.push([character, types as WeaponType[], saved])
    } else if (
      type === 'PROUD_EFFECT_COMBINE_MULTIPLY_OUTPUT' ||
      type === 'PROUD_EFFECT_COMBINE_RETURN_MATERIAL'
    ) {
      const chance = Number(params[0]) / 10000
      const kinds = kindsOfCombine.get(Number(params[1]))
      const double = type === 'PROUD_EFFECT_COMBINE_MULTIPLY_OUTPUT'
      const share = Number(params[2])
      // Potions and other crafts outside the planner's families are left out.
      if (!kinds || !(chance > 0 && chance <= 1) || !(share > 0)) continue
      for (const kind of kinds)
        crafting.push([character, kind, double ? 'double' : 'refund', chance, share])
    }
  }
  if (ascensionMora.length === 0)
    problems.error(
      'No weapon ascension Mora passives found (ProudSkill lifeEffectType / depot links changed?)',
    )
  const order = (a: [string, ...unknown[]], b: [string, ...unknown[]]) => a[0].localeCompare(b[0])
  return { ascensionMora: ascensionMora.sort(order), crafting: crafting.sort(order) }
}

function checkInputs(inputs: FarmingInputs, problems: Problems): void {
  checkFields(problems, 'DungeonExcelConfigData', inputs.dungeons, {
    type: 0.9,
    limitLevel: 0.2,
    statueCostID: 300,
    statueCostCount: 300,
    passRewardPreviewID: 0.3,
    previewMonsterList: 50,
    showLevel: 0.3,
  })
  checkFields(problems, 'RewardPreviewExcelConfigData', inputs.rewardPreviews, {
    id: 0.99,
    previewItems: 0.9,
  })
  checkFields(problems, 'ForgeExcelConfigData', inputs.forges, {
    resultItemId: 0.9,
    resultItemCount: 0.9,
    materialItems: 0.9,
    scoinCost: 0.5,
    forgeTime: 0.5,
  })
  checkFields(problems, 'BlossomChestExcelConfigData', inputs.blossomChests, {
    refreshType: 0.9,
    resin: 2,
  })
  checkFields(problems, 'MonsterExcelConfigData', inputs.monsters, { id: 0.99, describeId: 100 })
  checkFields(problems, 'MonsterDescribeExcelConfigData', inputs.monsterDescribes, {
    id: 0.99,
    nameTextMapHash: 0.9,
  })
  checkFields(problems, 'WeaponExcelConfigData', inputs.weapons, { weaponBaseExp: 0.5 })
  checkFields(problems, 'MaterialExcelConfigData', inputs.materials, { stackLimit: 0.5 })
}
