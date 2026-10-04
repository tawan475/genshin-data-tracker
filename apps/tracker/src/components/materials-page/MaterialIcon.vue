<script lang="ts">
/**
 * Icon URLs that failed this session (Enka lacks about a quarter of the
 * material icons). Remembered so a tile scrolled back into view, or the same
 * material in another place, goes straight to its letters instead of asking
 * the CDN again.
 */
const failedUrls = new Set<string>()
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * A material image, or a letter tile (the name's initials) when there is no
 * icon or it fails to load. Size and backdrop come from the parent's classes.
 */
const props = defineProps<{ src: string; name: string }>()

const failed = ref(failedUrls.has(props.src))
watch(
  () => props.src,
  (src) => (failed.value = failedUrls.has(src)),
)

function onError() {
  failedUrls.add(props.src)
  failed.value = true
}

const initials = computed(() =>
  props.name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter((w) => w && !['Of', 'The', 'And', 'A', 'An'].includes(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
)
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    loading="lazy"
    decoding="async"
    draggable="false"
    class="size-full object-contain"
    @error="onError"
  />
  <span
    v-else
    class="flex size-full items-center justify-center font-semibold text-text-muted select-none"
    aria-hidden="true"
    >{{ initials }}</span
  >
</template>
