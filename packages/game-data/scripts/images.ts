#!/usr/bin/env node
/**
 * Checks which game images static.nanoka.cc serves, the tracker's image
 * host, and records the ones it lacks. For those, the tracker serves its own
 * copy when the local gi-cdn build (a client extraction) has the picture; the
 * app shows initials for the rest instead of asking.
 *
 *   pnpm --filter @gdt/game-data images                           # check new names and the ones missing last time
 *   pnpm --filter @gdt/game-data images --all                     # check every name again
 *   pnpm --filter @gdt/game-data images --gi-cdn-dir ../gi-cdn    # also copy what the host lacks from gi-cdn's build
 *
 * The names come from our data only (scripts/lib/image-names.ts): run this
 * after every `build`. One HEAD request per name with a gdt-game-data
 * User-Agent, 4 at a time, backing off on errors; names found are cached in
 * .cache/images/ so a rerun only asks about new and missing ones.
 *
 * Hosting: each missing name the app can show (`selfHostable`: not TCG card
 * art) that the gi-cdn checkout has built (`<dir>/public/ui/<name>.webp`,
 * native-size WebP) is copied to apps/tracker/public/gi/ (served at
 * /gi/<name>.webp) and listed in `hosted`. That folder is gitignored (the
 * art is the game's and the repo is public), so the files ship only with a
 * deploy from a checkout that has them. Without `--gi-cdn-dir` the previous
 * `hosted` names that are still missing are kept, whether or not their files
 * are here. Copies of names no longer hosted are deleted.
 *
 * Writes data/missing-images.json (`missing` and `hosted`); nothing is
 * written when a request failed.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { MaterialIndexFile, MissingImagesFile, PlannerFile } from '../src/format.ts'
import { entryIcon, entryId } from '../src/icons.ts'
import { CURRENCIES } from './compile/materials.ts'
import { IMAGE_HOST, imageNames, nameSetHash, selfHostable } from './lib/image-names.ts'
import { get, HttpError, pool } from './lib/http.ts'
import { formatJson, readJson, readJsonIfExists, writeIfChanged } from './lib/json.ts'
import { CACHE_DIR, DATA_DIR, HOSTED_DIR } from './lib/paths.ts'

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
                       pnpm was run); the missing names the app can show that it has are
                       copied to apps/tracker/public/gi/<name>.webp (gitignored)`)
  process.exit(0)
}

const OUTPUT = join(DATA_DIR, 'missing-images.json')
const FOUND = join(CACHE_DIR, 'images', 'found.json')

/** Copies `<built>/<name>.webp` to HOSTED_DIR; false when the build doesn't have it. */
function host(built: string, name: string): boolean {
  const source = join(built, `${name}.webp`)
  if (!existsSync(source)) return false
  const target = join(HOSTED_DIR, `${name}.webp`)
  // Rewrite only real changes, so file times (and a deploy's upload) stay put.
  if (!existsSync(target) || !readFileSync(target).equals(readFileSync(source))) {
    copyFileSync(source, target)
  }
  return true
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

  // --- our own copies of what the host lacks --------------------------------------
  // pnpm runs this from packages/game-data; resolve against where it was called.
  const giCdnDir =
    args['gi-cdn-dir'] && resolve(process.env.INIT_CWD ?? process.cwd(), args['gi-cdn-dir'])
  const built = giCdnDir && join(giCdnDir, 'public', 'ui')
  if (built && !existsSync(join(built, 'index.json'))) {
    console.error(`--gi-cdn-dir: no gi-cdn build in ${built} (run \`pnpm run build\` there)`)
    return 1
  }
  const previous = new Set(readJsonIfExists<MissingImagesFile>(OUTPUT)?.hosted ?? [])
  const hostable = [...missing].filter((name) => selfHostable(names.get(name)!)).sort()
  if (built) mkdirSync(HOSTED_DIR, { recursive: true })
  const hosted: string[] = []
  const neither: string[] = []
  for (const name of hostable) {
    const has = built ? host(built, name) : previous.has(name)
    ;(has ? hosted : neither).push(name)
  }
  const keep = new Set(hosted.map((name) => `${name}.webp`))
  const removed: string[] = []
  const present: string[] = []
  for (const file of existsSync(HOSTED_DIR) ? readdirSync(HOSTED_DIR) : []) {
    if (!file.endsWith('.webp')) continue
    if (keep.has(file)) {
      present.push(file)
      continue
    }
    unlinkSync(join(HOSTED_DIR, file))
    removed.push(file)
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

  const bytes = present.reduce((sum, name) => sum + statSync(join(HOSTED_DIR, name)).size, 0)
  console.log(
    `\nServed from apps/tracker/public/gi/ (gitignored): ${hosted.length} of ${hostable.length}` +
      ` missing names the app shows; ${present.length} files here (${Math.round(bytes / 1024)} KB)` +
      (built ? ` copied from ${built}` : '; no --gi-cdn-dir, so the previous list was kept'),
  )
  if (removed.length) console.log(`  deleted (no longer hosted): ${removed.join(', ')}`)
  if (present.length < hosted.length) {
    console.log(
      `  ${hosted.length - present.length} hosted names have no file here: a deploy from this` +
        ' checkout shows initials for them (rerun with --gi-cdn-dir).',
    )
  }
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
