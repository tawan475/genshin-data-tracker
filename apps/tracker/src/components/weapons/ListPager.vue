<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { formatNumber } from '@/lib/format'

/** Pages through a long list: "97–192 / 214" with previous / next. */
const props = defineProps<{ total: number; pageSize: number; label: string }>()
const page = defineModel<number>({ required: true })

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const first = computed(() => (props.total === 0 ? 0 : (page.value - 1) * props.pageSize + 1))
const last = computed(() => Math.min(props.total, page.value * props.pageSize))
</script>

<template>
  <nav v-if="pageCount > 1" class="flex items-center justify-end gap-2" :aria-label="label">
    <span class="tabular mr-2 font-mono text-sm text-text-secondary">
      {{ formatNumber(first) }}–{{ formatNumber(last) }} / {{ formatNumber(total) }}
    </span>
    <button
      type="button"
      class="inline-flex size-11 items-center justify-center rounded-xl border border-border-default bg-surface-raised text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
      aria-label="Previous page"
      title="Previous page"
      :disabled="page <= 1"
      @click="page = page - 1"
    >
      <ChevronLeft class="size-5" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="inline-flex size-11 items-center justify-center rounded-xl border border-border-default bg-surface-raised text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
      aria-label="Next page"
      title="Next page"
      :disabled="page >= pageCount"
      @click="page = page + 1"
    >
      <ChevronRight class="size-5" aria-hidden="true" />
    </button>
  </nav>
</template>
