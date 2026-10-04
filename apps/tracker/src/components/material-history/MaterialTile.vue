<script setup lang="ts">
import { ref, watch } from 'vue'

/** A material's icon, or the original letter tile when there is none (or it fails). */
const props = defineProps<{ src: string; name: string }>()

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    loading="lazy"
    class="w-8 h-8 object-contain"
    @error="failed = true"
  />
  <div
    v-else
    class="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500"
  >
    {{ name.charAt(0) }}
  </div>
</template>
