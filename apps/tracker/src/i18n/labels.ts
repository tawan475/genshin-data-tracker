import { i18n } from './index'
import { locale, type Locale } from './locale'

/** A group of plain labels in the `game` messages (stat names, slots, elements…). */
export type LabelGroup =
  | 'stat'
  | 'statShort'
  | 'statTiny'
  | 'statTile'
  | 'slot'
  | 'slotFull'
  | 'element'
  | 'weaponType'

const tables = new Map<string, Readonly<Record<string, string>>>()

function group(target: Locale, name: LabelGroup): Readonly<Record<string, string>> {
  const messages = i18n.global.getLocaleMessage(target) as { game?: Record<string, unknown> }
  return (messages.game?.[name] as Record<string, string> | undefined) ?? {}
}

/**
 * A group's labels in the language on screen, English under any it lacks.
 * Plain lookups, built once per language (grids read thousands of them, so
 * no t() per cell); reading `locale` makes callers re-render on a switch.
 */
export function labelsFor(name: LabelGroup): Readonly<Record<string, string>> {
  const target = locale.value
  const id = `${target}|${name}`
  let table = tables.get(id)
  if (!table) {
    table = target === 'en' ? group('en', name) : { ...group('en', name), ...group(target, name) }
    tables.set(id, table)
  }
  return table
}

/**
 * A table that reads like the old constant (`ELEMENT_LABELS.pyro`,
 * `Object.entries(SLOT_LABELS)`) but answers in the language on screen.
 * Read it where it renders (a template, a computed), not into a module-level
 * constant, or that copy stays in one language.
 */
export function labelTable<K extends string>(name: LabelGroup): Readonly<Record<K, string>> {
  return new Proxy({} as Record<K, string>, {
    get: (_, key) => (typeof key === 'string' ? labelsFor(name)[key] : undefined),
    has: (_, key) => typeof key === 'string' && key in labelsFor(name),
    ownKeys: () => Object.keys(group('en', name)),
    getOwnPropertyDescriptor: (_, key) =>
      typeof key === 'string' && key in group('en', name)
        ? { enumerable: true, configurable: true, value: labelsFor(name)[key] }
        : undefined,
  })
}
