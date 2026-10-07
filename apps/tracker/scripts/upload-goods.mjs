#!/usr/bin/env node
// Uploads a folder of GOOD files to a tracker the way irminsul does
// (multipart `file` + `timestamp`, header x-import-key), oldest first, and
// reports what the server did with each.
//
//   GDT_IMPORT_KEY=gdt_ik_... node scripts/upload-goods.mjs <dir> [--url https://genshin-tracker.475.dev] [--gzip] [--concurrency 1] [--limit N]
//   (set GDT_DIAG_KEY too to get the server's D1 cost per import)
//
// Useful for importing old exports and as a load test: it prints latency
// percentiles and how many bytes the server actually stored.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
const url = option('url', 'http://localhost:5173').replace(/\/$/, '')
const gzip = args.includes('--gzip')
const concurrency = Number(option('concurrency', '1'))
const limit = Number(option('limit', 'Infinity'))
const key = process.env.GDT_IMPORT_KEY
// With the diag key the server reports its D1 cost per import (x-gdt-d1).
const diagKey = process.env.GDT_DIAG_KEY

if (!dir || !key) {
  console.error(
    'usage: GDT_IMPORT_KEY=... node scripts/upload-goods.mjs <dir> [--url URL] [--gzip] [--concurrency N]',
  )
  process.exit(2)
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((name) => {
    const text = readFileSync(join(dir, name), 'utf8')
    return { name, text, timestamp: JSON.parse(text).timestamp ?? null }
  })
  .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || a.name.localeCompare(b.name))
  .slice(0, limit)

const results = []
let next = 0
async function worker() {
  while (next < files.length) {
    const file = files[next++]
    const form = new FormData()
    if (file.timestamp !== null) form.set('timestamp', String(file.timestamp))
    const body = gzip ? gzipSync(file.text) : file.text
    form.set(
      'file',
      new File([body], gzip ? `${file.name}.gz` : file.name, {
        type: gzip ? 'application/gzip' : 'application/json',
      }),
    )
    let response
    let ms
    for (let attempt = 0; ; attempt++) {
      const started = performance.now()
      response = await fetch(`${url}/api/genshin-accounts-public/import-by-key`, {
        method: 'POST',
        headers: { 'x-import-key': key, ...(diagKey ? { 'x-diag-key': diagKey } : {}) },
        body: form,
      })
      ms = performance.now() - started
      if (response.status !== 429 || attempt >= 20) break
      // The daily upload quota only starts over at 00:00 UTC: no use waiting.
      const refusal = await response
        .clone()
        .json()
        .catch(() => ({}))
      if (refusal.error?.code === 'daily_upload_limit') break
      await response.body?.cancel()
      await new Promise((r) => setTimeout(r, 3000))
    }
    const json = await response.json().catch(() => ({}))
    const d1 = Object.fromEntries(
      (response.headers.get('x-gdt-d1') ?? '')
        .split(';')
        .filter(Boolean)
        .map((part) => {
          const [k, v] = part.trim().split('=')
          return [k, Number(v)]
        }),
    )
    results.push({
      ...json,
      name: file.name,
      httpStatus: response.status,
      ms,
      sent: body.length,
      d1,
    })
    const tag = String(json.status ?? json.error?.code ?? response.status)
    console.log(
      `${String(results.length).padStart(4)}/${files.length} ${tag.padEnd(10)} ${ms.toFixed(0).padStart(6)} ms  ${file.name}`,
    )
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))

const ok = results.filter((r) => r.httpStatus < 300)
const ms = ok.map((r) => r.ms).sort((a, b) => a - b)
const pct = (p) =>
  ms.length ? ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))].toFixed(0) : '-'
const counts = Object.groupBy(results, (r) => r.status ?? r.error?.code ?? String(r.httpStatus))
const raw = ok.reduce((s, r) => s + (r.rawSize ?? 0), 0)
const stored = ok.reduce((s, r) => s + (r.storedSize ?? 0), 0)
const sent = results.reduce((s, r) => s + r.sent, 0)
console.log('\nresults:', Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length])))
console.log(`latency ms: p50 ${pct(50)}  p90 ${pct(90)}  p99 ${pct(99)}  max ${pct(100)}`)
console.log(
  `bytes: raw ${(raw / 1e6).toFixed(1)} MB, sent ${(sent / 1e6).toFixed(1)} MB, stored ${(stored / 1e3).toFixed(1)} KB ` +
    `(${ok.length ? (stored / ok.length / 1024).toFixed(2) : 0} KB/snapshot)`,
)
const costed = ok.filter((r) => r.d1['rows-read'] !== undefined)
if (costed.length) {
  const avg = (k) => (costed.reduce((s, r) => s + r.d1[k], 0) / costed.length).toFixed(1)
  const max = (k) => Math.max(...costed.map((r) => r.d1[k]))
  console.log(
    `d1 per import: round trips avg ${avg('round-trips')} max ${max('round-trips')}, ` +
      `rows read avg ${avg('rows-read')} max ${max('rows-read')}, rows written avg ${avg('rows-written')} max ${max('rows-written')}, ` +
      `sql ms avg ${avg('sql-ms')}`,
  )
}
