import { loadGameNames, type GameNames, type NameSection } from '@gdt/game-data'
import { shallowRef } from 'vue'
import { onLocaleChange, onLocaleLoad } from './index'
import { keyToName } from '@/lib/format'
import { locale, type Locale } from './locale'

/**
 * Game names in the language on screen: characters, weapons, artifact sets,
 * stats, elements, regions, bosses, enemies, domains… from the game's own
 * text (`@gdt/game-data` `loadGameNames`, one chunk per language). A
 * language's names load before it shows (`onLocaleLoad`), so a switch never
 * flashes English names; English needs no file (the callers' own English,
 * made from GOOD keys, is the name). Materials, artifact pieces,
 * achievements and anecdotes have their own lazy files and helpers.
 */

const loaded = new Map<Locale, Promise<GameNames>>()
const current = shallowRef<GameNames | null>(null)

function load(target: Locale): Promise<GameNames> {
  let names = loaded.get(target)
  if (!names) {
    names = loadGameNames(target)
    names.catch(() => loaded.delete(target))
    loaded.set(target, names)
  }
  return names
}

onLocaleLoad(async (target) => {
  if (target !== 'en') await load(target)
})

function show(target: Locale): void {
  if (target === 'en') {
    current.value = null
    return
  }
  void load(target).then(
    (names) => {
      if (locale.value === target) current.value = names
    },
    () => undefined,
  )
}

onLocaleChange(show)
// Imported by main.ts before the first language applies; if one already did, catch up.
show(locale.value)

/**
 * A game name in the language on screen, else `english` (what the caller
 * shows in English: usually made from the GOOD key). Reactive: reads the
 * language, so a template re-renders on a switch.
 */
export function gameName(section: NameSection, key: string | number, english: string): string {
  if (locale.value === 'en') return english
  return current.value?.name(section, key) ?? english
}

/** Whether the language on screen has its own text for a name (else the English shows). */
export function hasGameName(section: NameSection, key: string | number): boolean {
  return locale.value !== 'en' && Boolean(current.value?.has(section, key))
}

/** A character's name from its GOOD key (also an item's `location`). */
export function characterName(key: string): string {
  return gameName('characters', key, keyToName(key))
}
