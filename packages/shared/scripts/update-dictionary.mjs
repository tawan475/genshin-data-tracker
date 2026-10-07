#!/usr/bin/env node
// Appends new GOOD keys to the static dictionary.
//
//   node scripts/update-dictionary.mjs --character chars.json --material mats.json ...
//   (kinds: --character, --weapon, --material, --artifactSet)
//
// Each source is a JSON array of keys or a JSON object whose own keys are the
// GOOD keys. Keys already present are ignored; new ones are appended in sorted
// order. Nothing is ever reordered or removed: a key's id is its 1-based
// position, and every stored snapshot references keys by id.
//
// The script also rewrites `frozen.json`, which pins a hash of each list so a
// hand edit that reorders or drops keys fails the test suite.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const KINDS = ['character', 'weapon', 'material', 'artifactSet']
const dataDir = new URL('../src/dictionary/data/', import.meta.url)
const frozenFile = new URL('../src/dictionary/frozen.json', import.meta.url)

const sources = Object.fromEntries(KINDS.map((kind) => [kind, []]))
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 2) {
  const kind = args[i]?.replace(/^--/, '')
  const file = args[i + 1]
  if (!KINDS.includes(kind) || !file) {
    console.error(`usage: update-dictionary.mjs [--${KINDS.join('|--')} <file.json>]...`)
    process.exit(2)
  }
  sources[kind].push(file)
}

const frozen = {}
for (const kind of KINDS) {
  const file = new URL(`${kind}s.json`, dataDir)
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const known = new Set(existing)

  const incoming = new Set()
  for (const source of sources[kind]) {
    const parsed = JSON.parse(readFileSync(source, 'utf8'))
    for (const key of Array.isArray(parsed) ? parsed : Object.keys(parsed)) {
      if (typeof key === 'string' && key.length > 0 && !known.has(key)) incoming.add(key)
    }
  }

  const added = [...incoming].sort()
  const keys = existing.concat(added)
  writeFileSync(file, `[\n${keys.map((k) => `  ${JSON.stringify(k)}`).join(',\n')}\n]\n`)
  frozen[kind] = {
    count: keys.length,
    sha256: createHash('sha256').update(keys.join('\n')).digest('hex'),
  }
  console.log(`${kind}: ${existing.length} kept, ${added.length} appended`)
}

writeFileSync(frozenFile, `${JSON.stringify(frozen, null, 2)}\n`)
