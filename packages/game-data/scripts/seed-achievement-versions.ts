#!/usr/bin/env node
/**
 * One-off: seeds overrides/achievement-versions.json with the version each
 * achievement was added in, from stardb.gg (https://stardb.gg, thanks!). The
 * game data has no such field. Already done; after the seed, the build gives
 * achievements new to data/ the dump's game version by itself.
 *
 *   pnpm --filter @gdt/game-data seed-achievement-versions
 *
 * Existing entries win, so re-running only fills ids that are missing.
 */

import { join } from 'node:path'
import { get } from './lib/http.ts'
import { formatJson, readJsonIfExists, writeIfChanged } from './lib/json.ts'
import { OVERRIDES_DIR } from './lib/paths.ts'

const STARDB = 'https://stardb.gg/api/gi/achievements?lang=en'
const FILE = join(OVERRIDES_DIR, 'achievement-versions.json')
const COMMENT =
  'Version each achievement was added in, as {"x.y": [ids]}. Seeded once from stardb.gg ' +
  "(scripts/seed-achievement-versions.ts); achievements new to data/ later get the dump's " +
  'game version automatically. Edit to correct a version: move the id to the right list.'

interface StardbAchievement {
  id: number
  version: string
}

const response = await get(STARDB)
if (!response) throw new Error(`Not found: ${STARDB}`)
const achievements = (await response.json()) as StardbAchievement[]

const existing = readJsonIfExists<Record<string, unknown>>(FILE) ?? {}
const byVersion = new Map<string, Set<number>>()
const known = new Set<number>()
for (const [version, ids] of Object.entries(existing)) {
  if (version.startsWith('$') || !Array.isArray(ids)) continue
  byVersion.set(version, new Set(ids as number[]))
  for (const id of ids as number[]) known.add(id)
}

let added = 0
for (const { id, version } of achievements) {
  if (known.has(id) || !/^\d+\.\d+$/.test(version)) continue
  const set = byVersion.get(version) ?? new Set<number>()
  set.add(id)
  byVersion.set(version, set)
  known.add(id)
  added++
}

const versionOrder = (a: string, b: string) => {
  const [am, an] = a.split('.').map(Number) as [number, number]
  const [bm, bn] = b.split('.').map(Number) as [number, number]
  return am - bm || an - bn
}
const out: Record<string, unknown> = { $comment: COMMENT }
for (const version of [...byVersion.keys()].sort(versionOrder)) {
  out[version] = [...byVersion.get(version)!].sort((a, b) => a - b)
}
const changed = writeIfChanged(FILE, formatJson(out, 1))
console.log(
  `${achievements.length} achievements on stardb, ${added} added${changed ? '' : ' (file unchanged)'}`,
)
