#!/usr/bin/env node
/**
 * Checks which game images static.nanoka.cc serves, the tracker's image
 * host, and records the ones it lacks. Of those, the ones gi-cdn.475.dev has
 * (built from the game client by the private `gi-cdn` repo) load from there;
 * the app shows initials for the rest instead of asking.
 *
 *   pnpm --filter @gdt/game-data images                           # check new names and the ones missing last time
 *   pnpm --filter @gdt/game-data images --all                     # check every name again
 *   pnpm --filter @gdt/game-data images --gi-cdn-dir ../gi-cdn    # also pick what gi-cdn serves, from its build
 *
 * The names come from our data only (scripts/lib/image-names.ts): run this
 * after every `build`. One HEAD request per name with a gdt-game-data
 * User-Agent, 4 at a time, backing off on errors; names found are cached in
 * .cache/images/ so a rerun only asks about new and missing ones.
 *
 * gi-cdn: each missing name the app can show (`giCdnEligible`: not TCG card
 * art) that the gi-cdn checkout has built (`<dir>/public/ui/<name>.webp`)
 * becomes `hosted`. gi-cdn then publishes exactly that list (`pnpm run stage
 * --from <this repo>/packages/game-data/data/missing-images.json`, then
 * `pnpm run deploy` there). Without `--gi-cdn-dir` the previous `hosted`
 * names that are still missing are kept. No image enters this repo. Finally
 * the hosted names are asked of gi-cdn.475.dev itself; one it doesn't serve
 * yet is only a warning (deploy gi-cdn before the tracker).
 *
 * Writes data/missing-images.json (`missing` and `hosted`); nothing is
 * written when a request to static.nanoka.cc failed.
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { MaterialIndexFile, MissingImagesFile, PlannerFile } from '../src/format.ts'
import { entryIcon, entryId } from '../src/icons.ts'
import { CURRENCIES } from './compile/materials.ts'
import {
  GI_CDN_HOST,
  giCdnEligible,
  IMAGE_HOST,
  imageNames,
  nameSetHash,
} from './lib/image-names.ts'
import { get, HttpError, pool } from './lib/http.ts'
import { formatJson, readJson, readJsonIfExists, writeIfChanged } from './lib/json.ts'
import { CACHE_DIR, DATA_DIR } from './lib/paths.ts'

const { values: args } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    'gi-cdn-dir': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})
if (args.help) {
  console.log(`Usage: pnpm --filter @gdt/game-data images [--all] [--concurrency 4] [--gi-cdn-dir <dir>]
  --all                check every name again, not only new and missing ones
  --gi-cdn-dir <dir>   a gi-cdn checkout with its build in public/ui/ (relative to where
                       pnpm was run); the missing names it has become \`hosted\``)
  process.exit(0)
}

const OUTPUT = join(DATA_DIR, 'missing-images.json')
const FOUND = join(CACHE_DIR, 'images', 'found.json')
/** gi-cdn serves only the tracker's pages (by Origin or Referer), so the check says it is one. */
const TRACKER_ORIGIN = 'https://genshin-tracker.475.dev'

/**
 * Asks gi-cdn.475.dev for the hosted names (HEAD). Only reports: gi-cdn is
 * deployed from its own repo, possibly after this runs.
 */
async function checkGiCdn(hosted: readonly string[]): Promise<void> {
  if (hosted.length === 0) return
  const ask = (name: string) =>
    get(`${GI_CDN_HOST}${name}.webp`, {
      method: 'HEAD',
      attempts: 2,
      timeoutMs: 15_000,
      headers: { origin: TRACKER_ORIGIN },
    })
  try {
    await ask(hosted[0]!)
  } catch (error) {
    const reason = error instanceof HttpError ? `HTTP ${error.status}` : (error as Error).message
    console.log(
      `\nWarning: ${GI_CDN_HOST} didn't answer (${reason}); not checked. Deploy gi-cdn first.`,
    )
    return
  }
  const notServed: string[] = []
  const failed: string[] = []
  await pool(hosted, Math.max(1, Number(args.concurrency) || 4), async (name) => {
    try {
      if (!(await ask(name))) notServed.push(name)
    } catch (error) {
      failed.push(
        `${name} (${error instanceof HttpError ? `HTTP ${error.status}` : (error as Error).message})`,
      )
    }
  })
  if (!notServed.length && !failed.length) {
    console.log(`${GI_CDN_HOST} serves all ${hosted.length}.`)
    return
  }
  console.log(
    `\nWarning: ${GI_CDN_HOST} doesn't serve ${notServed.length + failed.length} of ${hosted.length} yet ` +
      '(the app shows initials for them until gi-cdn is staged with this list and deployed):',
  )
  for (const name of [...notServed.sort(), ...failed.sort()]) console.log(`  ${name}`)
}

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

  // --- what gi-cdn serves of what the host lacks ----------------------------------
  // pnpm runs this from packages/game-data; resolve against where it was called.
  const giCdnDir =
    args['gi-cdn-dir'] && resolve(process.env.INIT_CWD ?? process.cwd(), args['gi-cdn-dir'])
  const built = giCdnDir && join(giCdnDir, 'public', 'ui')
  if (built && !existsSync(join(built, 'index.json'))) {
    console.error(`--gi-cdn-dir: no gi-cdn build in ${built} (run \`pnpm run build\` there)`)
    return 1
  }
  const previous = new Set(readJsonIfExists<MissingImagesFile>(OUTPUT)?.hosted ?? [])
  const eligible = [...missing].filter((name) => giCdnEligible(names.get(name)!)).sort()
  const hosted: string[] = []
  const neither: string[] = []
  for (const name of eligible) {
    const has = built ? existsSync(join(built, `${name}.webp`)) : previous.has(name)
    ;(has ? hosted : neither).push(name)
  }

  const file: MissingImagesFile = {
    source: `${IMAGE_HOST}<name>.webp`,
    names: names.size,
    hash: nameSetHash(names.keys()),
    missing: [...missing].sort(),
    hosted,
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

  const added = hosted.filter((name) => !previous.has(name))
  const dropped = [...previous].filter((name) => !hosted.includes(name)).sort()
  console.log(
    `\nFrom ${GI_CDN_HOST}: ${hosted.length} of ${eligible.length} missing names the app shows` +
      (built ? ` (in ${built})` : '; no --gi-cdn-dir, so the previous list was kept'),
  )
  if (added.length) console.log(`  new: ${added.join(', ')}`)
  if (dropped.length) console.log(`  no longer needed: ${dropped.join(', ')}`)
  if (neither.length) {
    console.log(`Initials (in neither ${IMAGE_HOST} nor ${built ?? 'the previous list'}):`)
    for (const name of neither) console.log(`  ${name} (${names.get(name)})`)
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
  const shownBy = new Set(hosted)
  const notableMissing = [...notable].filter((key) => {
    const icon = Object.hasOwn(index, key) ? entryIcon(index[key]!) : ''
    return icon && missing.has(icon) && !shownBy.has(icon)
  })
  console.log(
    `\nCurrencies, resin and planner materials without an icon: ${notableMissing.join(', ') || 'none'}`,
  )

  await checkGiCdn(hosted)

  console.log(changed ? '\nWrote data/missing-images.json' : '\ndata/missing-images.json unchanged')
  if (added.length || dropped.length) {
    console.log(
      `hosted changed: in gi-cdn, \`pnpm run stage --from ${OUTPUT}\` and \`pnpm run deploy\` before deploying the tracker.`,
    )
  }
  return 0
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
