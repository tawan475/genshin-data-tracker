/**
 * Dimbreath's game data dump (ExcelBinOutput + TextMap), read at one pinned
 * commit and cached under .cache/dump/<sha>/ so a rebuild never downloads
 * twice. The dump has moved before: both URLs can be overridden with
 * GDT_DUMP_RAW_URL / GDT_DUMP_API_URL or --raw-url / --api-url.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { get } from './http.ts'
import { CACHE_DIR } from './paths.ts'

export interface DumpConfig {
  /** `<rawUrl>/<sha>/<path>` serves a file at a commit. */
  rawUrl: string
  /** GitLab repository API (`<apiUrl>/commits`, `<apiUrl>/commits/<sha>`). */
  apiUrl: string
}

export const DEFAULT_DUMP: DumpConfig = {
  rawUrl: process.env.GDT_DUMP_RAW_URL ?? 'https://gitlab.com/Dimbreath/animegamedata2/-/raw',
  apiUrl: process.env.GDT_DUMP_API_URL ?? 'https://gitlab.com/api/v4/projects/83871005/repository',
}

/** Web address of the repository, for data/meta.json and credits. */
export function repoUrl(config: DumpConfig): string {
  return config.rawUrl.replace(/\/-\/raw\/?$/, '')
}

export interface Commit {
  sha: string
  /** e.g. "CNRELWin7.1.0_R48379043_S48511369_D48533839" */
  title: string
  date: string
}

/** "CNRELWin7.1.0_R…" -> "7.1"; null when the title names no version (a README edit). */
export function gameVersionOf(title: string): string | null {
  const match = /(\d+)\.(\d+)\.\d+/.exec(title)
  return match ? `${match[1]}.${match[2]}` : null
}

interface GitLabCommit {
  id: string
  title: string
  committed_date: string
}

async function getJson<T>(url: string): Promise<T> {
  const response = await get(url)
  if (!response) throw new Error(`Not found: ${url}`)
  return (await response.json()) as T
}

const toCommit = (c: GitLabCommit): Commit => ({
  sha: c.id,
  title: c.title,
  date: c.committed_date,
})

/**
 * Resolves `latest` (the newest commit whose title names a game version) or a
 * full/short sha to a commit. A full sha's lookup is cached.
 */
export async function resolveCommit(config: DumpConfig, ref: string): Promise<Commit> {
  if (ref === 'latest') {
    const commits = await getJson<GitLabCommit[]>(`${config.apiUrl}/commits?per_page=50`)
    const release = commits.find((c) => gameVersionOf(c.title))
    if (!release) throw new Error('No commit with a game version in its title among the latest 50')
    return toCommit(release)
  }
  if (!/^[0-9a-f]{7,40}$/.test(ref))
    throw new Error(`--ref must be a commit sha or "latest", got "${ref}"`)
  const cached = join(CACHE_DIR, 'dump', ref, 'commit.json')
  if (ref.length === 40 && existsSync(cached)) {
    return JSON.parse(readFileSync(cached, 'utf8')) as Commit
  }
  const commit = toCommit(await getJson<GitLabCommit>(`${config.apiUrl}/commits/${ref}`))
  const file = join(CACHE_DIR, 'dump', commit.sha, 'commit.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(commit, null, 2)}\n`)
  return commit
}

/**
 * Makes sure `<path>` (e.g. "ExcelBinOutput/AchievementExcelConfigData.json")
 * at `sha` is in the cache, downloading it once. Returns the local file.
 */
export async function fetchDumpFile(
  config: DumpConfig,
  sha: string,
  path: string,
): Promise<string> {
  const file = join(CACHE_DIR, 'dump', sha, path)
  if (existsSync(file)) return file
  const url = `${config.rawUrl}/${sha}/${path}`
  const started = Date.now()
  const response = await get(url, { timeoutMs: 600_000 })
  if (!response) throw new Error(`${path} does not exist at ${sha} (${url})`)
  const body = Buffer.from(await response.arrayBuffer())
  // Fail on a truncated download or an HTML error page before it lands in the cache.
  JSON.parse(body.toString('utf8'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
  const mb = (body.length / 1e6).toFixed(1)
  console.log(`  downloaded ${path} (${mb} MB, ${((Date.now() - started) / 1000).toFixed(1)} s)`)
  return file
}

/** Reads a cached dump file (see fetchDumpFile). */
export function readDumpJson<T>(sha: string, path: string): T {
  return JSON.parse(readFileSync(join(CACHE_DIR, 'dump', sha, path), 'utf8')) as T
}
