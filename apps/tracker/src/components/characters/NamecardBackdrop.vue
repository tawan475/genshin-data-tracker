<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * A character's namecard art behind a card or the details summary. Place
 * and fade it with classes (absolute position, opacity, mask). It shows
 * only once its own picture has loaded: switching characters drops the
 * old picture at once (a new <img> per src), never leaving it up while
 * the next one downloads. Nothing shows for '' or a failed load.
 */
const props = defineProps<{ src: string; lazy?: boolean }>()

const loaded = ref(false)
const failed = ref(false)
watch(
  () => props.src,
  () => {
    loaded.value = false
    failed.value = false
  },
)
</script>

<template>
  <img
    v-if="src && !failed"
    :key="src"
    :loading="lazy ? 'lazy' : undefined"
    decoding="async"
    :src="src"
    alt=""
    aria-hidden="true"
    class="pointer-events-none object-cover transition-opacity duration-300 motion-reduce:transition-none"
    :style="loaded ? undefined : { opacity: 0 }"
    @load="loaded = true"
    @error="failed = true"
  />
</template>
