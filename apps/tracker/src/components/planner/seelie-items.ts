/**
 * Seelie's extra item needs (`custom_items`: `{type, item, tier, value}`) as
 * planner materials. Seelie names an item by its type, a family or item slug
 * and a 0-based tier ("common", "drive_shaft", 2 = the third Drive Shaft).
 * Slugs mostly use words of the English names, so a slug maps when its words
 * pick exactly one family (or item) of the type's kinds; the rest are in the
 * alias table. Anything else is reported, not guessed.
 *
 * The goals half of a Seelie import is `@/data/seelie`.
 */

import type { MaterialKind, PlannerData, PlannerMaterial } from '@gdt/game-data'

/** Seelie inventory types and the planner kinds they hold. */
const KINDS: Readonly<Record<string, readonly MaterialKind[]>> = {
  talent: ['book'],
  wam: ['weapon'],
  common: ['common'],
  common_rare: ['elite'],
  element_1: ['gem'],
  element_2: ['boss'],
  boss: ['weekly'],
  local: ['local'],
  special: ['crown', 'currency'],
  xp: ['exp'],
  wep_xp: ['ore'],
  mora: ['mora'],
}

/** Slugs whose words don't pick one family or item: slug -> GOOD key (a family's lowest tier). */
const ALIASES: Readonly<Record<string, string>> = {
  f_insignia: 'RecruitsInsignia',
  th_insignia: 'TreasureHoarderInsignia',
  chaos: 'ChaosDevice',
  chaos_g: 'ChaosGear',
  chaos_s: 'ChaosStorage',
  prism: 'DismalPrism',
  d_prism: 'DamagedPrism',
  l_bone: 'LightlessBone',
  hilt: 'RuinedHilt',
  shell: 'DesiccatedShell',
  core: 'RiftCore',
  life: 'HollowRootOfLife',
  maguu_kishin: 'MarionetteCore',
  tenkumo_fruit: 'AmakumoFruit',
  glaze_lilly: 'GlazeLily',
  signora_flower: 'MoltenMoment',
  signora_wings: 'HellfireButterfly',
  signora_heart: 'AshenHeart',
  doctor_madman: 'MadmansRestraint',
  doctor_elixir: 'ElixirOfTheHeretic',
  crown: 'CrownOfInsight',
  fairness: 'TeachingsOfEquity',
  vayuda_turqoise: 'VayudaTurquoiseSliver',
  mist_veiled_elixer: 'MistVeiledLeadElixir',
  redcrest: 'HennaBerry',
}

const words = (slug: string) =>
  slug
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

/** Every word of the slug is a word of the key (`whole`) or a part of it. */
function matches(slug: string, key: string, whole: boolean): boolean {
  const list = words(slug)
  if (list.length === 0) return false
  if (!whole) {
    const k = key.toLowerCase()
    return list.every((w) => k.includes(w))
  }
  const parts = new Set(key.split(/(?=[A-Z0-9])/).map((w) => w.toLowerCase()))
  return list.every((w) => parts.has(w))
}

/** Families (or single items) of `pool` with a member matching the slug. */
function candidates(pool: readonly PlannerMaterial[], slug: string, whole: boolean) {
  const found = new Map<string, PlannerMaterial>()
  for (const m of pool) {
    if (!matches(slug, m.key, whole)) continue
    const head = m.family?.members[0] ?? m
    found.set(head.key, head)
  }
  return [...found.values()]
}

export interface SeelieItems {
  /** Extra needs by GOOD key (several Seelie rows for one key are added up). */
  items: { key: string; count: number }[]
  /** `type/item/tier` of rows with no planner material, sorted. */
  unmapped: string[]
}

/**
 * Maps one Seelie row to a planner material, or null. `tier` is 0-based in
 * the family (lowest first); EXP items are `xp` / `xp_sub_1` / `xp_sub_0`
 * (largest first), weapon ores the same with `wep_xp`.
 */
export function seelieMaterial(
  planner: Pick<PlannerData, 'materialsByKey' | 'expItems' | 'mora'>,
  type: string,
  item: string,
  tier: number,
): PlannerMaterial | null {
  const kinds = KINDS[type]
  if (!kinds) return null
  if (type === 'mora') return planner.mora
  if (type === 'xp' || type === 'wep_xp') {
    const list = planner.expItems[type === 'xp' ? 'character' : 'weapon']
    const sub = /_sub_(\d)$/.exec(item)
    const index = sub ? Number(sub[1]) : list.length - 1
    return list[index]?.material ?? null
  }
  const pool = [...planner.materialsByKey.values()].filter((m) => kinds.includes(m.kind))
  const alias = ALIASES[item]
  let base: PlannerMaterial | undefined
  if (alias) base = planner.materialsByKey.get(alias)
  else {
    // Whole words first ("light" is not "Moonlight"), then parts of words.
    const whole = candidates(pool, item, true)
    const loose = whole.length === 1 ? whole : candidates(pool, item, false)
    if (loose.length === 1) base = loose[0]
  }
  if (!base || !kinds.includes(base.kind)) return null
  if (!base.family) return tier === 0 ? base : null
  return base.family.members[tier] ?? null
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The export's `custom_items` (rows with no amount are left out). */
export function mapSeelieItems(
  json: unknown,
  planner: Pick<PlannerData, 'materialsByKey' | 'expItems' | 'mora'>,
): SeelieItems {
  const rows = isObject(json) && Array.isArray(json.custom_items) ? json.custom_items : []
  const counts = new Map<string, number>()
  const unmapped = new Set<string>()
  for (const row of rows as unknown[]) {
    if (!isObject(row)) continue
    const { type, item, tier, value } = row
    if (typeof type !== 'string' || typeof item !== 'string') continue
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0
    if (count <= 0) continue
    const t = typeof tier === 'number' && Number.isInteger(tier) ? tier : 0
    const material = seelieMaterial(planner, type, item, t)
    if (!material) {
      unmapped.add(`${type}/${item}/${t}`)
      continue
    }
    counts.set(material.key, (counts.get(material.key) ?? 0) + count)
  }
  return {
    items: [...counts].map(([key, count]) => ({ key, count: Math.min(count, 1_000_000_000) })),
    unmapped: [...unmapped].sort(),
  }
}

/**
 * Which stored weapon goal each imported one is, so importing the same file
 * again changes nothing: the n-th imported goal of a weapon and owner is the
 * n-th stored one (in their order); one past them is new (null).
 */
export function matchWeaponGoals(
  incoming: readonly { key: string; owner: string }[],
  stored: readonly { id: string; key: string; owner: string }[],
): (string | null)[] {
  const pools = new Map<string, string[]>()
  for (const s of stored) {
    const slot = `${s.key}:${s.owner}`
    const pool = pools.get(slot)
    if (pool) pool.push(s.id)
    else pools.set(slot, [s.id])
  }
  return incoming.map((w) => pools.get(`${w.key}:${w.owner}`)?.shift() ?? null)
}
