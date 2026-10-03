<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from './BaseButton.vue'

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
  const scrollParent =
    anchor.closest('.overflow-auto') || document.documentElement
  const rect = anchor.getBoundingClientRect()
  const parentRect = scrollParent.getBoundingClientRect()
  const targetScrollTop =
    scrollParent.scrollTop + (rect.top - parentRect.top) - 100
  if (scrollParent.scrollTop > targetScrollTop) {
    scrollParent.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
  }
}

const showPagination = () =>
  props.showWhenSinglePage || props.meta.totalPages > 1
</script>

<template>
  <div
    v-if="showPagination()"
    class="flex flex-wrap justify-between items-center gap-4 mt-6"
  >
    <div class="flex items-center gap-2">
      <label class="text-sm text-slate-500 dark:text-slate-400 font-medium">
        Per page:
      </label>
      <select
        :value="meta.limit"
        class="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500"
        @change="emit('limit-change', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="opt in limitOptions" :key="opt" :value="opt">
          {{ opt }}
        </option>
      </select>
    </div>

    <div class="flex items-center gap-4">
      <BaseButton
        variant="outline"
        size="sm"
        :disabled="meta.page <= 1 || isLoading"
        @click="handlePageChange(meta.page - 1)"
      >
        Previous
      </BaseButton>
      <span class="text-sm text-slate-600 dark:text-slate-400 font-medium">
        Page {{ meta.page }} of {{ meta.totalPages }}
        <span class="text-slate-400 dark:text-slate-500 font-normal">
          ({{ meta.total }} total)
        </span>
      </span>
      <BaseButton
        variant="outline"
        size="sm"
        :disabled="meta.page >= meta.totalPages || isLoading"
        @click="handlePageChange(meta.page + 1)"
      >
        Next
      </BaseButton>
    </div>

    <div class="flex items-center gap-2">
      <label class="text-sm text-slate-500 dark:text-slate-400 font-medium">
        Go to:
      </label>
      <input
        v-model="pageInput"
        type="number"
        min="1"
        :max="meta.totalPages"
        class="w-16 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500"
        @keyup.enter="goToPage"
      />
      <BaseButton
        variant="primary"
        size="sm"
        :disabled="isLoading"
        @click="goToPage"
      >
        Go
      </BaseButton>
    </div>
  </div>
</template>
