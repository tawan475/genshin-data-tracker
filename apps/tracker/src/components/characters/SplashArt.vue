<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import { characterIcon, characterSplash } from '@/lib/assets'
import { isDecoded, markDecoded } from '@/lib/image-preload'

/**
 * A character's wish splash art (the Traveler's follows the twin setting),
 * cropped to its box around the middle, where the character stands. It
 * fades in once loaded, and a new character drops the old picture at once.
 * A character newer than the game data (or a failed load) shows the
 * portrait, or initials, centred instead. Position and size the box
 * from outside (absolute or relative, with a height).
 */
const props = defineProps<{
  characterKey: string
  name: string
  rarity: number | null
  /** Classes for the <img> (zoom, crop position); fills its box with object-cover by default. */
  imgClass?: string
  /** Show the picture at once (the share card waits for it before exporting). */
  eager?: boolean
}>()

const src = computed(() => characterSplash(props.characterKey))
// Shown at once when preloaded (lib/image-preload); else faded in once loaded.
const loaded = ref(isDecoded(src.value))
const failed = ref(false)
watch(src, (url) => {
  loaded.value = isDecoded(url)
  failed.value = false
})
function onLoad() {
  markDecoded(src.value)
  loaded.value = true
}
</script>

<template>
  <div class="overflow-hidden">
    <img
      v-if="src && !failed"
      :key="src"
      :src="src"
      alt=""
      aria-hidden="true"
      decoding="async"
      class="pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none"
      :class="imgClass"
      :style="loaded || eager ? undefined : { opacity: 0 }"
      @load="onLoad"
      @error="failed = true"
    />
    <div v-else class="absolute inset-0 flex items-center justify-center">
      <GameIcon
        :src="characterIcon(characterKey)"
        :name="name"
        :rarity="rarity ?? undefined"
        size="lg"
        class="size-32! rounded-2xl!"
      />
    </div>
  </div>
</template>
