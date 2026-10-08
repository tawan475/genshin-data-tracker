<script lang="ts">
/**
 * Icon URLs that failed this session (an icon the image host gained or lost
 * since its last check). Remembered so a tile scrolled back into view, or the
 * same material in another place, goes straight to its letters instead of
 * asking the host again.
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
  <!-- loading/decoding before src: a lazy image off screen then isn't fetched or decoded. -->
  <img
    v-if="src && !failed"
    loading="lazy"
    decoding="async"
    :src="src"
    alt=""
    draggable="false"
    class="relative size-full object-contain"
    @error="onError"
  />
  <span
    v-else
    class="relative flex size-full items-center justify-center font-semibold text-text-muted select-none"
    aria-hidden="true"
    >{{ initials }}</span
  >
</template>
