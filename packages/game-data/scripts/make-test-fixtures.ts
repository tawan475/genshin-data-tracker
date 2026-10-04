#!/usr/bin/env node
/**
 * Refreshes the two test oracles in test/fixtures/ (small, trimmed copies):
 *
 * - go-character-costs.json: character ascension and talent costs from
 *   Genshin Optimizer's allCharacterMats_gen.json (MIT), with item keys
 *   interned. Our compiled costs must equal GO's for every key both have.
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
  ['stardb-achievements.json', stardbFixture, 1],
] as const) {
  const changed = writeIfChanged(join(FIXTURES, file), formatJson(value, expand))
  console.log(`${file}: ${changed ? 'written' : 'unchanged'}`)
}
