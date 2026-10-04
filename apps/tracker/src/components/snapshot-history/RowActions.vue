<script setup lang="ts">
import { Download, Trash2 } from 'lucide-vue-next'
import UiSpinner from '@/components/ui/UiSpinner.vue'

/**
 * One snapshot's Download GOOD and Delete: the old table's DL / Del buttons
 * (indigo, soft red) as icons, the names in the tooltips.
 */
defineProps<{ id: number; downloading: boolean; deleting: boolean }>()
defineEmits<{ download: []; delete: [] }>()
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      type="button"
      class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-sm shadow-accent/30 transition-colors hover:bg-accent-hover disabled:opacity-50"
      title="Download GOOD"
      :aria-label="`Download snapshot ${id}`"
      :disabled="downloading"
      @click="$emit('download')"
    >
      <UiSpinner v-if="downloading" class="size-4" />
      <Download v-else class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-surface text-danger-text transition-colors hover:border-danger hover:bg-danger hover:text-white disabled:opacity-50"
      title="Delete snapshot"
      :aria-label="`Delete snapshot ${id}`"
      :disabled="deleting"
      @click="$emit('delete')"
    >
      <Trash2 class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
