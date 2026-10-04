#!/usr/bin/env node
/**
 * Checks which game images static.nanoka.cc serves, the tracker's only image
 * host, and records the ones it lacks so the app shows initials for them
 * instead of asking.
 *
 *   pnpm --filter @gdt/game-data images         # check new names and the ones missing last time
 *   pnpm --filter @gdt/game-data images --all   # check every name again
 *
 * The names come from our data only (scripts/lib/image-names.ts): run this
 * after every `build`. One HEAD request per name with a gdt-game-data
 * User-Agent, 4 at a time, backing off on errors; names found are cached in
 * .cache/images/ so a rerun only asks about new and missing ones. Writes
 * data/missing-images.json (nothing is written when a request failed).
 */

import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { MaterialIndexFile, MissingImagesFile, PlannerFile } from '../src/format.ts'
import { entryIcon, entryId } from '../src/icons.ts'
import { CURRENCIES } from './compile/materials.ts'
import { IMAGE_HOST, imageNames, nameSetHash } from './lib/image-names.ts'
import { get, HttpError, pool } from './lib/http.ts'
import { formatJson, readJson, readJsonIfExists, writeIfChanged } from './lib/json.ts'
import { CACHE_DIR, DATA_DIR } from './lib/paths.ts'

const { values: args } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})
if (args.help) {
  console.log('Usage: pnpm --filter @gdt/game-data images [--all] [--concurrency 4]')
  process.exit(0)
}

const OUTPUT = join(DATA_DIR, 'missing-images.json')
const FOUND = join(CACHE_DIR, 'images', 'found.json')

async function main(): Promise<number> {
  const names = imageNames()
  const found = new Set(args.all ? [] : (readJsonIfExists<string[]>(FOUND) ?? []))
  const missing = new Set<string>()
  const errors: string[] = []
  const toCheck = [...names.keys()].filter((name) => !found.has(name)).sort()
  console.log(`${names.size} image names, ${toCheck.length} to check on ${IMAGE_HOST}`)

  let done = 0
  await pool(toCheck, Math.max(1, Number(args.concurrency) || 4), async (name) => {
    try {
      const response = await get(`${IMAGE_HOST}${name}.webp`, {
        method: 'HEAD',
        attempts: 4,
        timeoutMs: 30_000,
      })
      if (response && (response.headers.get('content-type') ?? '').startsWith('image/'))
        found.add(name)
      else missing.add(name)
    } catch (error) {
      errors.push(
        `${name}: ${error instanceof HttpError ? `HTTP ${error.status}` : (error as Error).message}`,
      )
    } finally {
      if (++done % 500 === 0) console.log(`  ${done}/${toCheck.length}`)
    }
  })
  writeIfChanged(
    FOUND,
    `${JSON.stringify([...found].filter((n) => names.has(n)).sort(), null, 1)}\n`,
  )

  if (errors.length) {
    console.log(`\n${errors.length} request(s) failed, so nothing was written; run again:`)
    for (const error of errors.slice(0, 20)) console.log(`  ${error}`)
    return 1
  }

  const file: MissingImagesFile = {
    source: `${IMAGE_HOST}<name>.webp`,
    names: names.size,
    hash: nameSetHash(names.keys()),
    missing: [...missing].sort(),
  }
  const changed = writeIfChanged(OUTPUT, formatJson(file, 2, { splitLists: true }))

  // Report: what is missing, by kind.
  const byKind = new Map<string, string[]>()
  for (const name of file.missing) {
    const what = names.get(name)!
    const kind = what.replace(/ \S+$/, '').replace(/ Traveler$/, '')
    byKind.set(kind, [...(byKind.get(kind) ?? []), `${name} (${what})`])
  }
  console.log(
    `\n${names.size - file.missing.length} of ${names.size} found, ${file.missing.length} missing`,
  )
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${kind}: ${list.length}  e.g. ${list.slice(0, 3).join(', ')}`)
  }
  const shown = file.missing.filter((n) => !/^(material|TCG card art) /.test(names.get(n)!))
  if (shown.length) {
    console.log('\nMissing outside materials (the app shows initials there):')
    for (const name of shown) console.log(`  ${name} (${names.get(name)})`)
  }
  // The materials the app shows outside the bag: currencies, resin and planner costs.
  const index = readJson<MaterialIndexFile>(join(DATA_DIR, 'materials.json')).materials
  const planner = readJson<PlannerFile>(join(DATA_DIR, 'planner.json'))
  const notable = new Set([
    ...Object.keys(index).filter((key) => CURRENCIES.has(entryId(index[key]!))),
    planner.resin.original,
    planner.resin.condensed[0],
    ...planner.resin.items.map(([key]) => key),
    ...planner.materials.map(([, key]) => key),
  ])
  const notableMissing = [...notable].filter(
    (key) => Object.hasOwn(index, key) && missing.has(entryIcon(index[key]!)),
  )
  console.log(
    `\nCurrencies, resin and planner materials without an icon: ${notableMissing.join(', ') || 'none'}`,
  )
  console.log(changed ? '\nWrote data/missing-images.json' : '\ndata/missing-images.json unchanged')
  return 0
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
