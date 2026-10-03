#!/usr/bin/env node
// Generates src/utils/data/MaterialIcons_gen.json: GOOD material key -> the
// game's icon name, which the Enka CDN serves at https://enka.network/ui/<name>.png
// (see materialIcon in src/lib/assets.ts).
//
// Inputs come from a datamine of the game (Dimbreath's AnimeGameData, on GitLab):
//   ExcelBinOutput/MaterialExcelConfigData.json  (id, icon, nameTextMapHash)
//   TextMap/TextMapEN.json                       (hash -> English name)
// Names become GOOD keys with toGoodKey from @gdt/shared, exactly as irminsul
// and the import path do. Only keys the tracker can store are kept (the shared
// materials dictionary, plus any extra key lists given), minus item types that
// never sit in the bag as a stack (furniture blueprints, namecards, outfits…),
// which keeps the file small enough to lazy-load.
//
//   node scripts/make-material-icons.mjs <MaterialExcelConfigData.json> <TextMapEN.json> [more TextMap files…] [--keys extra.json]
//
// --keys takes a JSON array of keys, or a GOOD file (its `materials` keys are
// used); those keys always get an icon when the datamine has one, whatever
// their type.

import { readFileSync, writeFileSync } from 'node:fs'
import { toGoodKey } from '../../../packages/shared/src/good.ts'

const args = process.argv.slice(2)
const files = []
const extraKeyFiles = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keys') extraKeyFiles.push(args[++i])
  else files.push(args[i])
}
const [excelPath, ...textMapPaths] = files
if (!excelPath || textMapPaths.length === 0) {
  console.error(
    'usage: node scripts/make-material-icons.mjs <MaterialExcelConfigData.json> <TextMapEN.json> [more TextMap files] [--keys extra.json]',
  )
  process.exit(2)
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const held = new Set()
for (const path of extraKeyFiles) {
  const data = readJson(path)
  const keys = Array.isArray(data) ? data : Object.keys(data.materials ?? {})
  for (const key of keys) held.add(key)
}
const wanted = new Set([
  ...readJson(
    new URL('../../../packages/shared/src/dictionary/data/materials.json', import.meta.url),
  ),
  ...held,
])

/** Consumed or unlocked on receipt, so never a GOOD `materials` count. */
const NOT_IN_BAG = new Set([
  'MATERIAL_ADSORBATE',
  'MATERIAL_AVATAR',
  'MATERIAL_AVATAR_TALENT_MATERIAL',
  'MATERIAL_AVATAR_TRACE',
  'MATERIAL_CHANNELLER_SLAB_BUFF',
  'MATERIAL_COSTUME',
  'MATERIAL_FLYCLOAK',
  'MATERIAL_FURNITURE_FORMULA',
  'MATERIAL_FURNITURE_SUITE_FORMULA',
  'MATERIAL_MUSIC_GAME_BOOK_THEME',
  'MATERIAL_NAMECARD',
  'MATERIAL_PHOTOGRAPH_POSE',
  'MATERIAL_PROFILE_FRAME',
  'MATERIAL_PROFILE_PICTURE',
  'MATERIAL_WEAPON_SKIN',
])

const textMap = {}
for (const path of textMapPaths) Object.assign(textMap, readJson(path))

const materials = readJson(excelPath)
/** key -> { rank, icon } of the entry chosen so far. */
const chosen = new Map()
let named = 0
for (const entry of materials) {
  const name = textMap[String(entry.nameTextMapHash)]
  const icon = typeof entry.icon === 'string' ? entry.icon.trim() : ''
  if (!name || !icon) continue
  named++
  const key = toGoodKey(name)
  if (!wanted.has(key)) continue
  const skipped = NOT_IN_BAG.has(entry.materialType)
  if (skipped && !held.has(key)) continue
  // Several entries can share a name (event copies, quest variants); a bag
  // type beats the rest, then the lowest id: the original item players hold.
  const rank = [skipped ? 1 : 0, entry.id]
  const previous = chosen.get(key)
  if (
    !previous ||
    rank[0] < previous.rank[0] ||
    (rank[0] === previous.rank[0] && rank[1] < previous.rank[1])
  ) {
    chosen.set(key, { rank, icon })
  }
}

const out = Object.fromEntries(
  [...chosen].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, v]) => [key, v.icon]),
)
const target = new URL('../src/utils/data/MaterialIcons_gen.json', import.meta.url)
writeFileSync(target, `${JSON.stringify(out, null, 0)}\n`)

console.log(
  `${materials.length} materials in the excel, ${named} with a name and icon; ` +
    `${chosen.size} of ${wanted.size} tracked keys got an icon -> ${target.pathname}`,
)
