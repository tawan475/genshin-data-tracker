/**
 * The live sync replay gate (docs/plans/live-sync.md §6.4), on real
 * recordings: `irminsul --replay-journal <out.ndjson> <recording.pcapng>`
 * writes what the sender would have sent, then
 *
 *   GDT_JOURNAL_REPLAY=<out.ndjson>[;<more.ndjson>] pnpm --filter @gdt/shared test live-replay
 *
 * checks that each snapshot with the batches after it, applied with
 * applyDelta, gives every `state` line (irminsul's whole export at that
 * moment). Skipped without the variable: recordings are personal data and
 * stay in E:/gdt-playground.
 *
 * Lines: `{"type":"snapshot","good":{…}}`, `{"type":"batch","delta":{…}}`,
 * `{"type":"state","good":{…}}`.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyDelta, canonicalLiveGood, goodDeltaSchema, type LiveGood } from '../src'

const files = (process.env.GDT_JOURNAL_REPLAY ?? '').split(';').filter(Boolean)

describe.skipIf(files.length === 0)('journal replay', () => {
  it.each(files)('%s: snapshot + batches = every state', (file) => {
    let current: LiveGood | null = null
    let lastSeq = 0
    let batches = 0
    let states = 0
    let changes = 0
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    for (const [index, line] of lines.entries()) {
      const entry = JSON.parse(line) as { type: string; good?: LiveGood; delta?: unknown }
      if (entry.type === 'snapshot') {
        current = entry.good!
        lastSeq = 0
      } else if (entry.type === 'batch') {
        const delta = goodDeltaSchema.parse(entry.delta)
        expect(current, `line ${index + 1}: a batch before any snapshot`).not.toBeNull()
        expect(delta.seq, `line ${index + 1}: seq`).toBe(lastSeq + 1)
        lastSeq = delta.seq
        current = applyDelta(current!, delta.changes)
        batches++
        changes += delta.changes.length
      } else if (entry.type === 'state' && current) {
        const want = canonicalLiveGood(entry.good!)
        const have = canonicalLiveGood(current)
        // Narrow a failure down to the sections that differ.
        for (const key of new Set([...Object.keys(want), ...Object.keys(have)])) {
          expect(have[key], `line ${index + 1}: ${key}`).toEqual(want[key])
        }
        states++
      }
    }
    console.log(`${file}: ${batches} batches, ${changes} changes, ${states} states checked`)
    expect(states).toBeGreaterThan(0)
  })
})
