<script setup lang="ts">
import { inject, ref, watch } from 'vue'
import { isDecoded, markDecoded } from '@/lib/image-preload'
import { CARD_STILL } from './share-card'

/**
 * A character image that never shows the previous character's picture: a
 * new <img> per `src` (keyed), invisible until its own picture has loaded,
 * then faded in; at once when it was preloaded and decoded already
 * (lib/image-preload), or inside a card drawn for the export (CARD_STILL).
 * Whatever sits behind it (a disc, a rarity strip) shows meanwhile.
 * Attributes (class, alt) go to the <img>.
 */
const props = defineProps<{ src: string }>()
const still = inject(CARD_STILL, false)

const loaded = ref(still || isDecoded(props.src))
watch(
  () => props.src,
  (src) => (loaded.value = still || isDecoded(src)),
)

function onLoad() {
  markDecoded(props.src)
  loaded.value = true
}
</script>

<template>
  <img
    v-if="src"
    :key="src"
    :src="src"
    alt=""
    decoding="async"
    draggable="false"
    class="transition-opacity duration-200 motion-reduce:transition-none"
    :style="loaded ? undefined : { opacity: 0 }"
    @load="onLoad"
  />
</template>
