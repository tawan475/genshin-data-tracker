/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import en from '../locales/en'
import zhCN from '../locales/zh-CN'
import zhTW from '../locales/zh-TW'

/** Every message as `namespace.path` -> text. */
function flatten(value: unknown, prefix = '', out = new Map<string, string>()) {
  if (typeof value === 'string') {
    out.set(prefix, value)
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  }
  return out
}

/** Named placeholders (`{n}`, `{name}`), sorted; vue-i18n's literal `{'@'}` excluded. */
const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{\s*([A-Za-z_][\w]*)\s*\}/g)].map((m) => m[1]))].sort()

const english = flatten(en)

describe.each([
  ['zh-CN', flatten(zhCN)],
  ['zh-TW', flatten(zhTW)],
])('%s messages', (_name, messages) => {
  it('has exactly the English keys', () => {
    expect([...messages.keys()].filter((key) => !english.has(key))).toEqual([])
    expect([...english.keys()].filter((key) => !messages.has(key))).toEqual([])
  })

  it('keeps every placeholder and is never empty', () => {
    const wrong: string[] = []
    for (const [key, text] of messages) {
      const source = english.get(key)
      if (source === undefined) continue
      if (!text.trim() && source.trim()) wrong.push(`${key}: empty`)
      if (placeholders(text).join() !== placeholders(source).join()) {
        wrong.push(`${key}: ${placeholders(source).join()} -> ${placeholders(text).join()}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('is not a copy of the English (left untranslated)', () => {
    // Text without letters (numbers, symbols, names kept as is) may match.
    const same = [...messages].filter(
      ([key, text]) =>
        /[a-z]{3}/i.test(text) && text === english.get(key) && !/^[A-Z0-9 .+%/×-]+$/.test(text),
    )
    // A few English-only tokens are allowed (brand names, game abbreviations).
    expect(same.length).toBeLessThanOrEqual(Math.max(10, english.size * 0.02))
  })
})

describe('source files', () => {
  const sources = import.meta.glob<string>(['/src/**/*.ts', '/src/**/*.vue', '!**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('never translate at module top level (that text would stay in one language)', () => {
    const frozen: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      // In a .vue file only its <script> blocks count; `<script setup>` runs per component.
      const blocks = path.endsWith('.vue')
        ? [...text.matchAll(/<script(?![^>]*\bsetup\b)[^>]*>([\s\S]*?)<\/script>/g)].map(
            (m) => m[1]!,
          )
        : [text]
      for (const block of blocks) {
        block.split('\n').forEach((line, i) => {
          // A top-level binding whose value calls t( directly, not inside a function.
          const call = /(?<![\w.$])t\(\s*['"`]/.exec(line)
          if (!call || !/^(export\s+)?(const|let|var)\s[^=]*=/.test(line)) return
          const before = line.slice(0, call.index)
          if (!/=>|\bfunction\b/.test(before)) frozen.push(`${path}:${i + 1}`)
        })
      }
    }
    expect(frozen).toEqual([])
  })
})

describe('English messages', () => {
  it('are never empty', () => {
    expect([...english].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([])
  })
})
