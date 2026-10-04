/**
 * Every game image name the tracker can show, from the compiled data: each
 * material's icon (data/materials.json, TCG card art included), the
 * achievement category icons and everything in data/images.json. The
 * `images` script checks them against the image host; a test makes sure it
 * ran after the last build.
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { GoalsFile, ImagesFile, MaterialIndexFile } from '../../src/format.ts'
import { entryIcon } from '../../src/icons.ts'
import { readJson } from './json.ts'
import { DATA_DIR } from './paths.ts'

/** Where the app loads every image from (`apps/tracker/src/lib/assets.ts`). */
export const IMAGE_HOST = 'https://static.nanoka.cc/assets/gi/'

/** name -> what shows it (for reports), in a stable order. */
export function imageNames(): Map<string, string> {
  const names = new Map<string, string>()
  const add = (name: string, what: string) => {
    if (name && !names.has(name)) names.set(name, what)
  }
  const images = readJson<ImagesFile>(join(DATA_DIR, 'images.json'))
  for (const [key, [icon, namecard, attack, skill, burst, constellations]] of Object.entries(
    images.characters,
  )) {
    add(icon, `portrait ${key}`)
    add(namecard, `namecard ${key}`)
    for (const name of [attack, skill, burst]) add(name, `talent ${key}`)
    for (const name of constellations) add(name, `constellation ${key}`)
  }
  for (const [gender, icon] of Object.entries(images.traveler))
    add(icon, `portrait Traveler ${gender}`)
  for (const [key, pair] of Object.entries(images.weapons))
    for (const name of pair) add(name, `weapon ${key}`)
  for (const [key, pieces] of Object.entries(images.artifacts))
    for (const name of pieces) add(name, `artifact ${key}`)
  for (const [key, name] of Object.entries(images.items)) add(name, `item ${key}`)

  const goals = readJson<GoalsFile>(join(DATA_DIR, 'achievement-goals.json'))
  for (const [id, , icon] of goals.rows) add(icon, `achievement category ${id}`)
  const index = readJson<MaterialIndexFile>(join(DATA_DIR, 'materials.json'))
  for (const [key, entry] of Object.entries(index.materials)) {
    const icon = entryIcon(entry)
    add(icon, `${/^UI_Gcg_Card(Face|Back)_/.test(icon) ? 'TCG card art' : 'material'} ${key}`)
  }
  return names
}

/** Identifies a set of names: sha256 of the sorted names, one per line (16 hex digits). */
export function nameSetHash(names: Iterable<string>): string {
  return createHash('sha256')
    .update([...names].sort().join('\n'))
    .digest('hex')
    .slice(0, 16)
}
