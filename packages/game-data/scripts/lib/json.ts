import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * JSON with the outer `expand` levels one entry per line (so a git diff shows
 * which rows changed) and everything deeper on that entry's line. Arrays of
 * plain values stay on one line unless `splitLists` (one value per line, for
 * name lists). Key order is the caller's: the compilers emit sorted objects,
 * so output is stable.
 */
export function formatJson(value: unknown, expand = 1, { splitLists = false } = {}): string {
  const write = (node: unknown, depth: number, indent: string): string => {
    if (depth >= expand || node === null || typeof node !== 'object') return JSON.stringify(node)
    const inner = `${indent}  `
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]'
      if (!splitLists && node.every((item) => item === null || typeof item !== 'object'))
        return JSON.stringify(node)
      return `[\n${node.map((item) => inner + write(item, depth + 1, inner)).join(',\n')}\n${indent}]`
    }
    const entries = Object.entries(node).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return '{}'
    return `{\n${entries
      .map(([key, v]) => `${inner}${JSON.stringify(key)}: ${write(v, depth + 1, inner)}`)
      .join(',\n')}\n${indent}}`
  }
  return `${write(value, 0, '')}\n`
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function readJsonIfExists<T>(path: string): T | undefined {
  return existsSync(path) ? readJson<T>(path) : undefined
}

/** Writes `text` unless the file already holds exactly that. Returns whether it changed. */
export function writeIfChanged(path: string, text: string): boolean {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return true
}

/** Object with its keys sorted (numeric keys numerically). */
export function sortedObject<V>(entries: Iterable<[string, V]>): Record<string, V> {
  const list = [...entries]
  list.sort(([a], [b]) => compareKeys(a, b))
  return Object.fromEntries(list)
}

export function compareKeys(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isInteger(na) && Number.isInteger(nb) && a !== '' && b !== '') return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}
