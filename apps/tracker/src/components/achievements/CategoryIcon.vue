<script setup lang="ts">
import { ref, watch } from 'vue'
import { Trophy } from 'lucide-vue-next'

/** An achievement category badge; a trophy when there is no image (or for "All"). */
const props = withDefaults(defineProps<{ src: string; size?: 'sm' | 'md' }>(), { size: 'md' })
const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center rounded-lg bg-surface-sunken"
    :class="size === 'sm' ? 'size-8' : 'size-9'"
    aria-hidden="true"
  >
    <img
      v-if="src && !failed"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-full object-contain p-0.5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)]"
      @error="failed = true"
    />
    <Trophy v-else class="size-5 text-text-muted" />
  </span>
</template>
