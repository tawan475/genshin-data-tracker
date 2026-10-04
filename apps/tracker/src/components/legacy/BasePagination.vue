<script setup lang="ts">
import { ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'

export interface PaginationMeta {
  page: number
  limit: number
  totalPages: number
  total: number
}

const props = withDefaults(
  defineProps<{
    meta: PaginationMeta
    isLoading?: boolean
    /** Show controls even when there is only one page (e.g. to change per-page). */
    showWhenSinglePage?: boolean
    limitOptions?: number[]
    scrollAnchor?: HTMLElement | null
  }>(),
  {
    isLoading: false,
    showWhenSinglePage: true,
    limitOptions: () => [10, 20, 24, 50, 100],
  },
)

const emit = defineEmits<{
  (e: 'page-change', page: number): void
  (e: 'limit-change', limit: number): void
}>()

const pageInput = ref(props.meta.page)
watch(
  () => props.meta.page,
  (newVal) => {
    pageInput.value = newVal
  },
)

const handlePageChange = (newPage: number) => {
  if (newPage >= 1 && newPage <= props.meta.totalPages && !props.isLoading) {
    emit('page-change', newPage)
    scrollToTop()
  }
}

const goToPage = () => {
  let target = parseInt(String(pageInput.value), 10)
  if (isNaN(target)) target = 1
  if (target < 1) target = 1
  if (target > props.meta.totalPages) target = props.meta.totalPages
  pageInput.value = target
  handlePageChange(target)
}

const scrollToTop = () => {
  const anchor = props.scrollAnchor
  if (!anchor) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const scrollParent = anchor.closest('.overflow-auto') || document.documentElement
  const rect = anchor.getBoundingClientRect()
  const parentRect = scrollParent.getBoundingClientRect()
  const targetScrollTop = scrollParent.scrollTop + (rect.top - parentRect.top) - 100
  if (scrollParent.scrollTop > targetScrollTop) {
    scrollParent.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
  }
}

const showPagination = () => props.showWhenSinglePage || props.meta.totalPages > 1

/** The old compact field (per page, go to page), on the input tokens. */
const FIELD =
  'rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-sm text-text-primary shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none'
</script>

<template>
  <div v-if="showPagination()" class="mt-6 flex flex-wrap items-center justify-between gap-4">
    <label class="flex items-center gap-2">
      <span class="text-sm font-medium text-text-muted">Per page</span>
      <select
        :value="meta.limit"
        :class="FIELD"
        @change="emit('limit-change', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="opt in limitOptions" :key="opt" :value="opt">
          {{ opt }}
        </option>
      </select>
    </label>

    <div class="flex items-center gap-4">
      <UiButton
        size="sm"
        :disabled="meta.page <= 1 || isLoading"
        @click="handlePageChange(meta.page - 1)"
      >
        Previous
      </UiButton>
      <span class="tabular text-sm font-medium text-text-secondary">
        Page {{ meta.page }} of {{ meta.totalPages }}
        <span class="font-normal text-text-muted"> ({{ meta.total }} total) </span>
      </span>
      <UiButton
        size="sm"
        :disabled="meta.page >= meta.totalPages || isLoading"
        @click="handlePageChange(meta.page + 1)"
      >
        Next
      </UiButton>
    </div>

    <form class="flex items-center gap-2" @submit.prevent="goToPage">
      <label class="flex items-center gap-2">
        <span class="text-sm font-medium text-text-muted">Go to</span>
        <input
          v-model="pageInput"
          type="number"
          min="1"
          :max="meta.totalPages"
          class="w-16"
          :class="FIELD"
        />
      </label>
      <UiButton type="submit" variant="primary" size="sm" :disabled="isLoading">Go</UiButton>
    </form>
  </div>
</template>
