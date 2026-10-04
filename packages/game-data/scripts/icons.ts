#!/usr/bin/env node
/**
 * Self-hosts the game icons the tracker shows, because the Enka CDN lacks
 * about half of the material icons (all of the newer planner materials).
 *
 *   pnpm --filter @gdt/game-data icons                  # fetch new icons, write the manifest
 *   pnpm --filter @gdt/game-data icons --retry-missing  # ask the sources again for icons none had
 *   pnpm --filter @gdt/game-data icons --refresh        # re-fetch and re-convert everything
 *   pnpm --filter @gdt/game-data icons --prune          # delete files no longer in the set
 *
 * The set: every material in data/materials.json (minus TCG card art, which
 * no source hosts and the tracker shows as initials) and every achievement
 * category icon. Each icon comes from the first of overrides/icons/<name>.png
 * (or .webp/.jpg), Enka, gi.yatta.moe, static.nanoka.cc that has it, is
 * scaled to fit 128 px and saved as WebP to apps/tracker/public/gi/<name>.webp.
 * Downloads are cached in .cache/icons/ and sources are asked gently (a
 * custom User-Agent, 4 requests at a time, backoff on errors). The manifest
 * data/icons.json records where each icon came from and which are missing;
 * the app only links to /gi/ for icons in it.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import type { GoalsFile, IconSource, IconsFile, MaterialIndexFile } from '../src/format.ts'
import { entryIcon } from '../src/icons.ts'
import { get, HttpError, pool } from './lib/http.ts'
import { formatJson, readJson, readJsonIfExists, writeIfChanged } from './lib/json.ts'
import {
  CACHE_DIR,
  DATA_DIR,
  OVERRIDES_DIR,
  SHARED_MATERIAL_KEYS,
  TRACKER_ICON_DIR,
} from './lib/paths.ts'

/** Output size: icons are shown at 28-64 CSS px, so 128 covers 2x screens. */
const SIZE = 128
const WEBP = { quality: 82, alphaQuality: 90, effort: 6 } as const
/** TCG card faces and backs: large card art no source hosts; shown as initials. */
const SKIP = [/^UI_Gcg_CardFace_/, /^UI_Gcg_CardBack_/]

interface Source {
  name: Exclude<IconSource, 'override'>
  ext: string
  url: (icon: string) => string
}
const SOURCES: Source[] = [
  { name: 'enka', ext: 'png', url: (icon) => `https://enka.network/ui/${icon}.png` },
  {
    name: 'yatta',
    ext: 'png',
    url: (icon) => {
      const folder = icon.startsWith('UI_AchievementIcon_')
        ? 'achievement/'
        : icon.startsWith('UI_Gcg')
          ? 'gcg/'
          : ''
      return `https://gi.yatta.moe/assets/UI/${folder}${icon}.png`
    },
  },
  { name: 'nanoka', ext: 'webp', url: (icon) => `https://static.nanoka.cc/assets/gi/${icon}.webp` },
]
const SOURCE_ORDER: IconSource[] = ['override', 'enka', 'yatta', 'nanoka']

const { values: args } = parseArgs({
  options: {
    refresh: { type: 'boolean', default: false },
    'retry-missing': { type: 'boolean', default: false },
    prune: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})
if (args.help) {
  console.log(
    `Usage: pnpm --filter @gdt/game-data icons [--retry-missing] [--refresh] [--prune] [--concurrency 4]`,
  )
  process.exit(0)
}

const MANIFEST = join(DATA_DIR, 'icons.json')
const MISSES = join(CACHE_DIR, 'icons', 'misses.json')

/** icon name -> what needs it (for the report). */
function iconSet(): Map<string, string> {
  const set = new Map<string, string>()
  const index = readJson<MaterialIndexFile>(join(DATA_DIR, 'materials.json'))
  for (const [key, entry] of Object.entries(index.materials)) {
    const icon = entryIcon(entry)
    if (!SKIP.some((pattern) => pattern.test(icon)) && !set.has(icon))
      set.set(icon, `material ${key}`)
  }
  const goals = readJson<GoalsFile>(join(DATA_DIR, 'achievement-goals.json'))
  for (const [id, , icon] of goals.rows)
    if (!set.has(icon)) set.set(icon, `achievement category ${id}`)
  return set
}

/** overrides/icons/<name>.<png|webp|jpg> by icon name. */
function overrideFiles(): Map<string, string> {
  const dir = join(OVERRIDES_DIR, 'icons')
  const files = new Map<string, string>()
  if (!existsSync(dir)) return files
  for (const file of readdirSync(dir)) {
    const match = /^(.+)\.(png|webp|jpe?g)$/i.exec(file)
    if (match) files.set(match[1]!, join(dir, file))
  }
  return files
}

async function toWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp(WEBP)
    .toBuffer()
}

/** Writes the icon unless the file already holds the same bytes. */
function save(icon: string, webp: Buffer): void {
  const out = join(TRACKER_ICON_DIR, `${icon}.webp`)
  if (existsSync(out) && readFileSync(out).equals(webp)) return
  writeFileSync(out, webp)
}

async function main(): Promise<number> {
  const concurrency = Math.max(1, Number(args.concurrency) || 4)
  const wanted = iconSet()
  const overrides = overrideFiles()
  const previous = readJsonIfExists<IconsFile>(MANIFEST)
  const previousSource = new Map<string, IconSource>()
  for (const source of SOURCE_ORDER) {
    for (const icon of previous?.sources[source] ?? []) previousSource.set(icon, source)
  }
  const misses: Record<string, string[]> = readJsonIfExists(MISSES) ?? {}
  const missed = new Map(
    SOURCES.map((s) => [s.name, new Set(args['retry-missing'] ? [] : (misses[s.name] ?? []))]),
  )

  mkdirSync(TRACKER_ICON_DIR, { recursive: true })
  for (const s of SOURCES) mkdirSync(join(CACHE_DIR, 'icons', s.name), { recursive: true })

  const result = new Map<string, IconSource>()
  const missing: string[] = []
  const errors: string[] = []
  let fetched = 0
  let done = 0
  const icons = [...wanted.keys()].sort()
  console.log(`${icons.length} icons in the set (${overrides.size} overrides)`)

  await pool(icons, concurrency, async (icon) => {
    const out = join(TRACKER_ICON_DIR, `${icon}.webp`)
    const override = overrides.get(icon)
    try {
      if (override) {
        const stale =
          args.refresh ||
          !existsSync(out) ||
          previousSource.get(icon) !== 'override' ||
          statSync(override).mtimeMs > statSync(out).mtimeMs
        if (stale) save(icon, await toWebp(readFileSync(override)))
        result.set(icon, 'override')
        return
      }
      const known = previousSource.get(icon)
      if (!args.refresh && known && known !== 'override' && existsSync(out)) {
        result.set(icon, known)
        return
      }
      for (const source of SOURCES) {
        if (missed.get(source.name)!.has(icon)) continue
        const cached = join(CACHE_DIR, 'icons', source.name, `${icon}.${source.ext}`)
        let input: Buffer | null = existsSync(cached) && !args.refresh ? readFileSync(cached) : null
        if (!input) {
          try {
            const response = await get(source.url(icon), { attempts: 4, timeoutMs: 30_000 })
            if (!response) {
              missed.get(source.name)!.add(icon)
              continue
            }
            input = Buffer.from(await response.arrayBuffer())
            fetched++
          } catch (error) {
            errors.push(
              `${icon} from ${source.name}: ${error instanceof HttpError ? `HTTP ${error.status}` : (error as Error).message}`,
            )
            continue
          }
        }
        let webp: Buffer
        try {
          webp = await toWebp(input)
        } catch (error) {
          errors.push(`${icon} from ${source.name}: not an image (${(error as Error).message})`)
          continue
        }
        writeFileSync(cached, input)
        missed.get(source.name)!.delete(icon)
        save(icon, webp)
        result.set(icon, source.name)
        return
      }
      missing.push(icon)
    } finally {
      if (++done % 250 === 0) console.log(`  ${done}/${icons.length}`)
    }
  })

  // Manifest and miss cache.
  const sources = Object.fromEntries(
    SOURCE_ORDER.map((s) => [s, [] as string[]]),
  ) as IconsFile['sources']
  for (const [icon, source] of result) sources[source].push(icon)
  for (const list of Object.values(sources)) list.sort()
  missing.sort()
  const manifest: IconsFile = { sources, missing }
  const changed = writeIfChanged(MANIFEST, formatJson(manifest, 3, { splitLists: true }))
  writeFileSync(
    MISSES,
    `${JSON.stringify(Object.fromEntries(SOURCES.map((s) => [s.name, [...missed.get(s.name)!].sort()])), null, 1)}\n`,
  )

  // Files in public/gi that nothing uses any more.
  const stale = readdirSync(TRACKER_ICON_DIR).filter(
    (file) => file.endsWith('.webp') && !result.has(file.slice(0, -'.webp'.length)),
  )
  if (args.prune) for (const file of stale) unlinkSync(join(TRACKER_ICON_DIR, file))

  // Report.
  let bytes = 0
  for (const icon of result.keys()) bytes += statSync(join(TRACKER_ICON_DIR, `${icon}.webp`)).size
  console.log(
    `\nHosted ${result.size} of ${icons.length} icons (${(bytes / 1e6).toFixed(2)} MB), ${fetched} downloaded this run`,
  )
  for (const source of SOURCE_ORDER) console.log(`  ${source.padEnd(8)} ${sources[source].length}`)
  console.log(`  missing  ${missing.length}`)
  if (missing.length) {
    const byPrefix = new Map<string, string[]>()
    for (const icon of missing) {
      const prefix = icon
        .replace(/_?\d+$/, '')
        .split('_')
        .slice(0, 3)
        .join('_')
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), icon])
    }
    console.log(
      '\nNo source has these (drop a PNG/WebP into overrides/icons/<name>.png to add one):',
    )
    for (const [prefix, list] of [...byPrefix].sort((a, b) => b[1].length - a[1].length)) {
      const sample = list.slice(0, 4).map((icon) => `${icon} (${wanted.get(icon)})`)
      console.log(`  ${prefix}: ${list.length}  e.g. ${sample.join(', ')}`)
    }
  }
  const dictionary = new Set(readJson<string[]>(SHARED_MATERIAL_KEYS))
  const index = readJson<MaterialIndexFile>(join(DATA_DIR, 'materials.json')).materials
  const known = [...dictionary].filter((key) => key in index)
  const hostedKnown = known.filter((key) => result.has(entryIcon(index[key]!)))
  console.log(
    `\nShared dictionary: ${known.length} of ${dictionary.size} material keys are in the index ` +
      `(the rest are non-bag items or player stats), ${hostedKnown.length} of those have a hosted icon`,
  )
  if (errors.length) {
    console.log(`\n${errors.length} download error(s) (not cached; run again to retry):`)
    for (const error of errors.slice(0, 20)) console.log(`  ${error}`)
  }
  if (stale.length) {
    console.log(
      `\n${stale.length} file(s) in public/gi are no longer in the set${args.prune ? ' and were deleted' : ' (--prune deletes them)'}`,
    )
  }
  console.log(changed ? '\nWrote data/icons.json' : '\ndata/icons.json unchanged')
  return errors.length ? 1 : 0
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
