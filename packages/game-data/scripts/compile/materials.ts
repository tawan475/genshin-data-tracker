/**
 * The material index (data/materials.json): every GOOD material key the
 * tracker can show, with its item id and icon. The app uses it for material
 * icons and for sorting/grouping the bag by item id.
 *
 * Keys are made exactly like irminsul makes them: the TextMap_MediumEN name
 * through toGoodKey. Item types that never sit in the bag as a stack are left
 * out (except the currencies irminsul exports), as are the game's test items.
 * Furnishing blueprints are in: they wait in the bag until used, and
 * irminsul exports them under the furnishing's name.
 * When several items share a key (quest copies, TCG card backs named after
 * flowers, blueprints named like an item), the representative is the planner
 * material or currency, else a normal bag item, else a quest item, else TCG,
 * else a blueprint; then the lowest id. overrides/keys.json
 * `materials.prefer` picks one by hand.
 *
 * The index only grows: a key that disappears from the dump (an item renamed
 * by the game) is carried over from the previous build, because snapshots
 * stored before the rename still hold it.
 */

import type { MaterialIndexEntry, MaterialIndexFile } from '../../src/format.ts'
import { checkFields, num, str, type Row, type TextMap } from '../lib/excel.ts'
import { sortedObject } from '../lib/json.ts'
import type { KeysOverride } from '../lib/overrides.ts'
import type { Problems } from '../lib/problems.ts'

/** Consumed or unlocked on receipt, so never a GOOD `materials` count. */
export const NOT_IN_BAG = new Set([
  'MATERIAL_ADSORBATE',
  'MATERIAL_AVATAR',
  'MATERIAL_AVATAR_TALENT_MATERIAL',
  'MATERIAL_AVATAR_TRACE',
  'MATERIAL_CHANNELLER_SLAB_BUFF',
  'MATERIAL_COSTUME',
  'MATERIAL_FLYCLOAK',
  'MATERIAL_MUSIC_GAME_BOOK_THEME',
  'MATERIAL_NAMECARD',
  'MATERIAL_PHOTOGRAPH_POSE',
  'MATERIAL_PROFILE_FRAME',
  'MATERIAL_PROFILE_PICTURE',
  'MATERIAL_WEAPON_SKIN',
])

/**
 * Currencies irminsul exports from player properties (its
 * EXPORTED_CURRENCY_PROPERTIES): Primogem and Mora are MATERIAL_ADSORBATE
 * like other instantly-used items, but they do sit in GOOD `materials`.
 */
export const CURRENCIES = new Set([106, 201, 202, 203, 204])

/** The game's own test items ("(TEST) Cocktail 16", "Jean Test Package", …). */
export const TEST_ITEM = /^\(test\)|^test |\btest (package|bundle)\b/i

/** Furnishing and furnishing set blueprints, named after what they unlock. */
const BLUEPRINTS = new Set(['MATERIAL_FURNITURE_FORMULA', 'MATERIAL_FURNITURE_SUITE_FORMULA'])

/** Preference when several items share a key: lower wins. */
function rank(type: string, planner: boolean): number {
  if (planner) return 0
  if (type === 'MATERIAL_QUEST') return 2
  if (type.startsWith('MATERIAL_GCG')) return 3
  if (BLUEPRINTS.has(type)) return 4
  return 1
}

export interface MaterialIndexContext {
  /** Planner material id -> key; these always win their key. */
  plannerKeys: Map<number, string>
  keys: KeysOverride
  toGoodKey: (name: string) => string
  previous?: MaterialIndexFile
  problems: Problems
}

export function compileMaterialIndex(
  materials: Row[],
  names: TextMap,
  context: MaterialIndexContext,
): MaterialIndexFile {
  const { problems, keys } = context
  checkFields(problems, 'MaterialExcelConfigData', materials, {
    id: 0.99,
    icon: 0.9,
    materialType: 0.9,
  })

  const chosen = new Map<string, { id: number; icon: string; rank: number }>()
  const ids = new Map<number, Row>()
  for (const material of materials) {
    const id = num(material, 'id')
    ids.set(id, material)
    const type = str(material, 'materialType')
    const planner = context.plannerKeys.has(id) || CURRENCIES.has(id)
    if (!planner && NOT_IN_BAG.has(type)) continue
    const name = names.get(material.nameTextMapHash)
    const icon = str(material, 'icon').trim()
    if (!name || !icon || TEST_ITEM.test(name)) continue
    const key = context.plannerKeys.get(id) ?? keys.materials.key.get(id) ?? context.toGoodKey(name)
    if (!key) continue
    const candidate = { id, icon, rank: rank(type, planner) }
    const current = chosen.get(key)
    if (
      !current ||
      candidate.rank < current.rank ||
      (candidate.rank === current.rank && candidate.id < current.id)
    ) {
      chosen.set(key, candidate)
    }
  }

  for (const [key, id] of keys.materials.prefer) {
    const material = ids.get(id)
    const icon = material ? str(material, 'icon').trim() : ''
    if (!material || !icon) {
      problems.error(
        `overrides/keys.json materials.prefer.${key}: item ${id} does not exist or has no icon`,
      )
      continue
    }
    chosen.set(key, { id, icon, rank: -1 })
  }

  const index = new Map<string, MaterialIndexEntry>()
  for (const [key, { id, icon }] of chosen) {
    // `UI_ItemIcon_<n>` (n without leading zeros, so it round-trips) is stored as n.
    const n = /^UI_ItemIcon_([1-9]\d*)$/.exec(icon)?.[1]
    if (n === undefined) index.set(key, [id, icon])
    else index.set(key, Number(n) === id ? id : [id, Number(n)])
  }

  let carried = 0
  for (const [key, value] of Object.entries(context.previous?.materials ?? {})) {
    if (index.has(key)) continue
    index.set(key, value)
    carried++
  }
  if (carried > 0) {
    problems.warn(
      `${carried} material key(s) left the dump (renamed or removed items) and were kept from the previous build`,
    )
  }
  return { materials: sortedObject(index) }
}
