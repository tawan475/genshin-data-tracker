<script setup lang="ts">
import { ref, watch } from 'vue'
import { isDecoded, markDecoded } from '@/lib/image-preload'

/**
 * A character's namecard art behind a card or the details summary. Place
 * and fade it with classes (absolute position, opacity, mask). It shows
 * only once its own picture has loaded: switching characters drops the
 * old picture at once (a new <img> per src), never leaving it up while
 * the next one downloads. Nothing shows for '' or a failed load.
 *
 * `priority` high (the first screen of a grid): fetched first and shown the
 * moment it decodes, without waiting for script (a busy page delayed the
 * fade-in by up to a second); low: after the rest.
 */
const props = defineProps<{ src: string; lazy?: boolean; priority?: 'high' | 'low' }>()

const loaded = ref(props.priority === 'high' || isDecoded(props.src))
const failed = ref(false)
watch(
  () => props.src,
  (src) => {
    loaded.value = props.priority === 'high' || isDecoded(src)
    failed.value = false
  },
)
function onLoad() {
  markDecoded(props.src)
  loaded.value = true
}
</script>

<template>
  <img
    v-if="src && !failed"
    :key="src"
    :loading="lazy ? 'lazy' : undefined"
    :fetchpriority="priority"
    decoding="async"
    :src="src"
    alt=""
    aria-hidden="true"
    class="pointer-events-none object-cover transition-opacity duration-300 motion-reduce:transition-none"
    :style="loaded ? undefined : { opacity: 0 }"
    @load="onLoad"
    @error="failed = true"
  />
</template>
