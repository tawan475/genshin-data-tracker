<script setup lang="ts">
import { computed } from 'vue'

/**
 * A white-on-transparent game glyph (talent, constellation) drawn as a mask,
 * so it takes the current text colour in either theme. Decorative: the
 * caller labels it. Renders nothing visible without a URL.
 */
const props = defineProps<{ src: string }>()

const style = computed(() =>
  props.src
    ? {
        maskImage: `url("${props.src}")`,
        WebkitMaskImage: `url("${props.src}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }
    : undefined,
)
</script>

<template>
  <span class="block shrink-0" :class="src ? 'bg-current' : ''" :style="style" aria-hidden="true" />
</template>
