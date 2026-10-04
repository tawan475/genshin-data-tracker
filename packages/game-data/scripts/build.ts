#!/usr/bin/env node
/**
 * Compiles data/ from Dimbreath's game data dump at one commit.
 *
 *   pnpm --filter @gdt/game-data build                 # rebuild at the sha in data/meta.json
 *   pnpm --filter @gdt/game-data build --ref <sha>     # move to another dump commit
 *   pnpm --filter @gdt/game-data build --ref latest    # the newest release commit
 *   … --dry-run                                        # compile, check and diff; write nothing
 *
 * Downloads go to .cache/ (once per commit). Overrides from overrides/ are
 * applied, everything is validated, and data/ is written only when there are
 * no errors. The printed summary lists what changed; review it before
 * committing. See README.md for the whole refresh routine.
 */

import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { toGoodKey } from '../../shared/src/good.ts'
import type {
  AchievementsFile,
  GoalsFile,
  MaterialIndexFile,
  MetaFile,
  PlannerFile,
  TextFile,
} from '../src/format.ts'
import { checkAppendOnly, describeChanges, type DataSet } from './lib/changes.ts'
import { checkDrops } from './lib/drops.ts'
import { ACHIEVEMENT_FILES, compileAchievements } from './compile/achievements.ts'
import { compileAvatarIcons } from './compile/avatars.ts'
import { compileMaterialIndex } from './compile/materials.ts'
import { compilePlanner, PLANNER_FILES, type PlannerInputs } from './compile/planner.ts'
import {
  DEFAULT_DUMP,
  fetchDumpFile,
  gameVersionOf,
  readDumpJson,
  repoUrl,
  resolveCommit,
  type DumpConfig,
} from './lib/dump.ts'
import { TextMap, type Row } from './lib/excel.ts'
import { pool } from './lib/http.ts'
import { formatJson, readJsonIfExists, writeIfChanged } from './lib/json.ts'
import { loadOverrides } from './lib/overrides.ts'
import { DATA_DIR } from './lib/paths.ts'
import { Problems } from './lib/problems.ts'

const TEXT_FILES = {
  medium: 'TextMap/TextMap_MediumEN.json',
  main: 'TextMap/TextMapEN.json',
} as const

/** Output files and how many JSON levels to put one entry per line. */
const OUTPUT = {
  meta: ['meta.json', 1],
  achievements: ['achievements.json', 2],
  goals: ['achievement-goals.json', 2],
  text: ['text/en.json', 2],
  planner: ['planner.json', 2],
  materials: ['materials.json', 2],
  avatars: ['avatars.json', 2],
} as const

const { values: args } = parseArgs({
  options: {
    ref: { type: 'string' },
    'raw-url': { type: 'string' },
    'api-url': { type: 'string' },
    'game-version': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (args.help) {
  console.log(`Usage: pnpm --filter @gdt/game-data build [--ref <sha>|latest] [--dry-run]
  --ref <sha|latest>     dump commit (default: the sha in data/meta.json)
  --game-version <x.y>   when the commit title names no version
  --raw-url <url>        dump file base (default ${DEFAULT_DUMP.rawUrl})
  --api-url <url>        GitLab repository API (default ${DEFAULT_DUMP.apiUrl})
  --dry-run              compile, validate and print changes without writing data/`)
  process.exit(0)
}

/**
 * GOOD keys are made with the shared toGoodKey; irminsul (Rust) only treats
 * a plain space as a word break. Names where the two would disagree are
 * reported so a key fix can go into overrides/keys.json.
 */
const keyMismatches = new Map<string, [string, string]>()
function irminsulKey(name: string): string {
  let key = ''
  let capitalize = true
  for (const c of name) {
    if (/[A-Za-z0-9]/.test(c)) {
      key += capitalize ? c.toUpperCase() : c
      capitalize = false
    } else if (c === ' ') {
      capitalize = true
    }
  }
  return key
}
function goodKey(name: string): string {
  const key = toGoodKey(name)
  const theirs = irminsulKey(name)
  if (key !== theirs) keyMismatches.set(name, [key, theirs])
  return key
}

function readPrevious(): DataSet {
  const read = <T>(name: keyof typeof OUTPUT) =>
    readJsonIfExists<T>(join(DATA_DIR, OUTPUT[name][0]))
  return {
    meta: read<MetaFile>('meta'),
    achievements: read<AchievementsFile>('achievements'),
    goals: read<GoalsFile>('goals'),
    text: read<TextFile>('text'),
    planner: read<PlannerFile>('planner'),
    materials: read<MaterialIndexFile>('materials'),
  }
}

async function main(): Promise<number> {
  const problems = new Problems()
  const overrides = loadOverrides(problems)
  if (!problems.ok) {
    problems.print()
    return 1
  }
  const previous = readPrevious()

  const config: DumpConfig = {
    rawUrl: args['raw-url'] ?? DEFAULT_DUMP.rawUrl,
    apiUrl: args['api-url'] ?? DEFAULT_DUMP.apiUrl,
  }
  const ref = args.ref ?? previous.meta?.sha
  if (!ref) {
    console.error('data/meta.json has no sha yet: pass --ref <sha> or --ref latest')
    return 1
  }
  const commit = await resolveCommit(config, ref)
  const gameVersion = args['game-version'] ?? gameVersionOf(commit.title)
  if (!gameVersion || !/^\d+\.\d+$/.test(gameVersion)) {
    console.error(`Commit "${commit.title}" names no game version; pass --game-version <x.y>`)
    return 1
  }
  console.log(`Dump ${commit.sha} "${commit.title}" (${commit.date}), game version ${gameVersion}`)

  const paths = [
    ...new Set<string>([
      ...Object.values(ACHIEVEMENT_FILES),
      ...Object.values(PLANNER_FILES),
      ...Object.values(TEXT_FILES),
    ]),
  ]
  await pool(paths, 3, async (path) => void (await fetchDumpFile(config, commit.sha, path)))

  console.log('Compiling…')
  // irminsul names things from TextMap_MediumEN only, so GOOD keys come from
  // it alone; display text (achievements, domains) also falls back to the
  // main TextMapEN. The two files hold disjoint hashes.
  const medium = readDumpJson<Record<string, string>>(commit.sha, TEXT_FILES.medium)
  const names = new TextMap(medium)
  const text = new TextMap(
    medium,
    readDumpJson<Record<string, string>>(commit.sha, TEXT_FILES.main),
  )
  const rows = (path: string) => readDumpJson<Row[]>(commit.sha, path)

  const achievements = compileAchievements(
    {
      achievements: rows(ACHIEVEMENT_FILES.achievements),
      goals: rows(ACHIEVEMENT_FILES.goals),
      rewards: rows(ACHIEVEMENT_FILES.rewards),
      text,
    },
    { gameVersion, versions: overrides.versions, previous: previous.achievements, problems },
  )

  const plannerInputs = Object.fromEntries(
    Object.entries(PLANNER_FILES).map(([name, path]) => [name, rows(path)]),
  ) as Omit<PlannerInputs, 'names' | 'text'>
  const planner = compilePlanner(
    { ...plannerInputs, names, text },
    {
      keys: overrides.keys,
      weekdays: overrides.weekdays,
      planner: overrides.planner,
      toGoodKey: goodKey,
      problems,
    },
  )
  checkDrops(overrides.drops, planner.planner, planner.checks, problems)
  const materials = compileMaterialIndex(plannerInputs.materials, names, {
    plannerKeys: planner.materialKeys,
    keys: overrides.keys,
    toGoodKey: goodKey,
    previous: previous.materials,
    problems,
  })

  const avatars = compileAvatarIcons(plannerInputs, planner.planner, problems)

  for (const [name, [ours, theirs]] of keyMismatches) {
    problems.warn(`"${name}": toGoodKey gives ${ours}, irminsul would export ${theirs}`)
  }

  const meta: MetaFile = {
    gameVersion,
    repo: repoUrl(config),
    sha: commit.sha,
    commitTitle: commit.title,
    commitDate: commit.date,
    builtAt: previous.meta?.builtAt ?? '',
  }
  const next: DataSet = {
    meta,
    achievements: achievements.achievements,
    goals: achievements.goals,
    text: achievements.text,
    planner: planner.planner,
    materials,
    avatars,
  }
  checkAppendOnly(previous, next, overrides.keys.removed, problems)

  console.log('\nChanges:')
  for (const line of describeChanges(previous, next)) console.log(line)
  console.log('')
  problems.print()
  if (!problems.ok) {
    console.error(`\nBuild failed with ${problems.errors.length} error(s); data/ was not written.`)
    return 1
  }
  if (args['dry-run']) {
    console.log('\nDry run: data/ was not written.')
    return 0
  }

  const written: string[] = []
  for (const name of [
    'achievements',
    'goals',
    'text',
    'planner',
    'materials',
    'avatars',
  ] as const) {
    const [file, expand] = OUTPUT[name]
    if (writeIfChanged(join(DATA_DIR, file), formatJson(next[name], expand))) written.push(file)
  }
  if (written.length > 0 || previous.meta?.sha !== meta.sha || !meta.builtAt) {
    meta.builtAt = new Date().toISOString()
  }
  if (writeIfChanged(join(DATA_DIR, OUTPUT.meta[0]), formatJson(meta, OUTPUT.meta[1]))) {
    written.push(OUTPUT.meta[0])
  }
  console.log(
    written.length
      ? `\nWrote data/${written.join(', data/')}. Next: pnpm --filter @gdt/game-data icons`
      : '\nNothing changed.',
  )
  return 0
}

main().then(
  (code) => (process.exitCode = code),
  (error: unknown) => {
    console.error(error)
    process.exitCode = 1
  },
)
