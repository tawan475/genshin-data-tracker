import { loadArtifactNames, type ArtifactNames, type ArtifactSlot } from '@gdt/game-data'
import { shallowRef } from 'vue'

// The game data's piece names, reactive: a card that rendered with the set's
// name re-renders with the piece's once they arrive (their own lazy chunk, ~4 KB
// gzip, loaded on first use).
const names = shallowRef<ArtifactNames | null>(null)
let loading: Promise<void> | null = null

function load(): void {
  loading ??= loadArtifactNames().then(
    (loaded) => void (names.value = loaded),
    () => void (loading = null), // the next card tries again
  )
}

/**
 * An artifact piece's own name ("Witch's Flower of Blaze"), from the game
 * data; undefined until it has loaded and for a set or slot it doesn't know
 * (the card then shows the set's name).
 */
export function artifactPieceName(setKey: string, slotKey: string): string | undefined {
  if (!names.value) load()
  return names.value?.name(setKey, slotKey as ArtifactSlot)
}
