#!/usr/bin/env node
/**
 * Refreshes the test oracles in test/fixtures/ (small, trimmed copies):
 *
 * - go-character-costs.json: character ascension and talent costs from
 *   Genshin Optimizer's allCharacterMats_gen.json (MIT), with item keys
 *   interned. Our compiled costs must equal GO's for every key both have.
 * - go-assets.json: image names (portraits, namecards, skills, bursts,
 *   constellations, weapons, artifact pieces) from GO's AssetsData_gen.json.
 *   Our data/images.json must name the same images.
 * - stardb-achievements.json: stardb.gg's achievement ids, hidden ids,
 *   per-category counts and primogem total. Our data must cover them.
 *
 *   node scripts/make-test-fixtures.ts
 *
 * Optional only: run it when GO or stardb have caught up with a new version,
 * then check the test still passes.
 */

import { join } from 'node:path'
import { get } from './lib/http.ts'
import { formatJson, writeIfChanged } from './lib/json.ts'
import { PACKAGE_DIR } from './lib/paths.ts'

const GO_URL =
  'https://raw.githubusercontent.com/frzyc/genshin-optimizer/master/libs/gi/mats/src/allCharacterMats_gen.json'
const GO_ASSETS_URL =
  'https://raw.githubusercontent.com/frzyc/genshin-optimizer/master/libs/gi/assets-data/src/AssetsData_gen.json'
const STARDB_URL = 'https://stardb.gg/api/gi/achievements?lang=en'
const FIXTURES = join(PACKAGE_DIR, 'test', 'fixtures')

async function getJson<T>(url: string): Promise<T> {
  const response = await get(url)
  if (!response) throw new Error(`Not found: ${url}`)
  return (await response.json()) as T
}

interface GoLevel {
  cost: number
  items: { item: string; amount: number }[]
}
type GoCharacter = {
  ascension: Record<string, GoLevel>
  talents: Record<'normal' | 'skill' | 'burst', Record<string, GoLevel>>
}

// --- Genshin Optimizer -------------------------------------------------------
const go = await getJson<Record<string, GoCharacter>>(GO_URL)
const items: string[] = []
const itemIndex = new Map<string, number>()
const intern = (key: string) => {
  let index = itemIndex.get(key)
  if (index === undefined) {
    index = items.length
    items.push(key)
    itemIndex.set(key, index)
  }
  return index
}
/** [mora, [[item index, amount], …]] for the given levels. */
const levels = (table: Record<string, GoLevel>, from: number, to: number) => {
  const out: [number, [number, number][]][] = []
  for (let level = from; level <= to; level++) {
    const entry = table[String(level)]
    if (!entry) throw new Error(`GO data lacks level ${level}`)
    out.push([entry.cost, entry.items.map((i) => [intern(i.item), i.amount])])
  }
  return out
}
const characters: Record<string, unknown> = {}
for (const key of Object.keys(go).sort()) {
  const c = go[key]!
  const normal = levels(c.talents.normal, 2, 10)
  const skill = levels(c.talents.skill, 2, 10)
  const burst = levels(c.talents.burst, 2, 10)
  const same =
    JSON.stringify(skill) === JSON.stringify(normal) &&
    JSON.stringify(burst) === JSON.stringify(normal)
  characters[key] = {
    ascension: levels(c.ascension, 1, 6),
    // One table when all three talents cost the same (everyone but the Traveler).
    talents: same ? [normal] : [normal, skill, burst],
  }
}
const goFixture = {
  $source: `${GO_URL} (Genshin Optimizer, MIT), trimmed by scripts/make-test-fixtures.ts`,
  $format:
    'characters[key].ascension: phases 1-6, talents: [normal, skill, burst] or [all three] for levels 2-10; each level is [mora, [[item index, amount]]] with item keys in items',
  items,
  characters,
}

// --- Genshin Optimizer image names ---------------------------------------------
type GoAssets = Record<'chars' | 'weapons' | 'artifacts', Record<string, Record<string, string>>>
const goAssets = await getJson<GoAssets>(GO_ASSETS_URL)
/** The fields of each entry, in order; '' where GO has none. Empty entries (unreleased) are left out. */
const pick = (table: Record<string, Record<string, string>>, fields: string[]) =>
  Object.fromEntries(
    Object.keys(table)
      .sort()
      .map((key) => [key, fields.map((f) => table[key]![f] ?? '')] as const)
      .filter(([, values]) => values.some(Boolean)),
  )
const assetsFixture = {
  $source: `${GO_ASSETS_URL} (Genshin Optimizer, MIT), trimmed by scripts/make-test-fixtures.ts`,
  $format:
    'chars: [icon, banner, skill, burst, constellation1..6]; weapons: [icon, awakenIcon]; artifacts: [flower, plume, sands, goblet, circlet]',
  chars: pick(goAssets.chars, [
    'icon',
    'banner',
    'skill',
    'burst',
    ...[1, 2, 3, 4, 5, 6].map((n) => `constellation${n}`),
  ]),
  weapons: pick(goAssets.weapons, ['icon', 'awakenIcon']),
  artifacts: pick(goAssets.artifacts, ['flower', 'plume', 'sands', 'goblet', 'circlet']),
}

// --- stardb ------------------------------------------------------------------
interface StardbAchievement {
  id: number
  series: number
  currency: number
  hidden: boolean
}
const stardb = await getJson<StardbAchievement[]>(STARDB_URL)
const series: Record<string, number> = {}
for (const a of stardb) series[a.series] = (series[a.series] ?? 0) + 1
const stardbFixture = {
  $source: `${STARDB_URL} (stardb.gg), summarised by scripts/make-test-fixtures.ts`,
  fetched: new Date().toISOString().slice(0, 10),
  count: stardb.length,
  primogems: stardb.reduce((sum, a) => sum + a.currency, 0),
  series,
  ids: stardb.map((a) => a.id).sort((a, b) => a - b),
  hidden: stardb
    .filter((a) => a.hidden)
    .map((a) => a.id)
    .sort((a, b) => a - b),
}

for (const [file, value, expand] of [
  ['go-character-costs.json', goFixture, 2],
  ['go-assets.json', assetsFixture, 2],
  ['stardb-achievements.json', stardbFixture, 1],
] as const) {
  const changed = writeIfChanged(join(FIXTURES, file), formatJson(value, expand))
  console.log(`${file}: ${changed ? 'written' : 'unchanged'}`)
}
