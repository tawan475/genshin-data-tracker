import type { MaterialIndexEntry } from './format'

/** Item id of a material index entry. */
export function entryId(entry: MaterialIndexEntry): number {
  return typeof entry === 'number' ? entry : entry[0]
}

/** Game icon name of a material index entry (`UI_ItemIcon_104013`, …). */
export function entryIcon(entry: MaterialIndexEntry): string {
  if (typeof entry === 'number') return `UI_ItemIcon_${entry}`
  const icon = entry[1]
  return typeof icon === 'number' ? `UI_ItemIcon_${icon}` : icon
}
