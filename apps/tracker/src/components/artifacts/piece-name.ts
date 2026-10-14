import { loadArtifactNames, type ArtifactNames, type ArtifactSlot } from '@gdt/game-data'
import { shallowRef } from 'vue'
import { onLocaleLoad } from '@/i18n'
import { locale, type Locale } from '@/i18n/locale'

// The game data's piece names per language, reactive: a card that rendered
// with the set's name re-renders with the piece's once they arrive (their own
// lazy chunk, ~4 KB gzip, loaded on first use and before a language switch
// shows once any card used them).
const names = shallowRef<ReadonlyMap<Locale, ArtifactNames>>(new Map())
const loading = new Map<Locale, Promise<void>>()

function load(target: Locale): Promise<void> {
  let pending = loading.get(target)
  if (!pending) {
    pending = loadArtifactNames(target).then(
      (loaded) => void (names.value = new Map(names.value).set(target, loaded)),
      () => void loading.delete(target), // the next card tries again
    )
    loading.set(target, pending)
  }
  return pending
}

onLocaleLoad((target) => (loading.size > 0 ? load(target) : Promise.resolve()))

/**
 * An artifact piece's own name ("Witch's Flower of Blaze"), from the game
 * data in the language on screen; undefined until it has loaded and for a set
 * or slot it doesn't know (the card then shows the set's name).
 */
export function artifactPieceName(setKey: string, slotKey: string): string | undefined {
  const target = locale.value
  if (!loading.has(target)) void load(target)
  return names.value.get(target)?.name(setKey, slotKey as ArtifactSlot)
}
