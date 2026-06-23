<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import BaseButton from './BaseButton.vue'

export interface TableLabel {
  key: string
  title: string
  slot?: boolean
  headerSlot?: boolean
}

export interface PaginationMeta {
  page: number
  limit: number
  totalPages: number
  total: number
}

const props = defineProps<{
  labels: TableLabel[]
  data: any[]
  isLoading?: boolean
  meta?: PaginationMeta
}>()

const emit = defineEmits<{
  (e: 'page-change', page: number): void
  (e: 'limit-change', limit: number): void
}>()

const handlePageChange = (newPage: number) => {
  if (!props.meta) return
  if (newPage >= 1 && newPage <= props.meta.totalPages && !props.isLoading) {
    emit('page-change', newPage)
  }
}

const pageInput = ref(props.meta?.page || 1)
watch(() => props.meta?.page, (newVal) => {
  if (newVal) pageInput.value = newVal
})

const goToPage = () => {
  if (!props.meta) return
  let target = parseInt(pageInput.value as any)
  if (isNaN(target)) target = 1
  if (target < 1) target = 1
  if (target > props.meta.totalPages) target = props.meta.totalPages
  
  pageInput.value = target
  handlePageChange(target)
}

const tableContainer = ref<HTMLElement | null>(null)

const scrollToTop = () => {
  if (tableContainer.value) {
    const rect = tableContainer.value.getBoundingClientRect()
    const scrollParent = tableContainer.value.closest('.overflow-auto') || document.documentElement
    const parentRect = scrollParent.getBoundingClientRect()
    
    // Calculate the absolute position of the table within the scroll container
    // and subtract 100px for the offset
    const targetScrollTop = scrollParent.scrollTop + (rect.top - parentRect.top) - 100
    
    // Only scroll if we are scrolled further down than the target
    if (scrollParent.scrollTop > targetScrollTop) {
      scrollParent.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
    }
  }
}

defineExpose({ scrollToTop })
</script>

<template>
  <div ref="tableContainer" class="relative overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm w-full transition-colors">
    <!-- Loading Overlay for when we have data but are fetching more -->
    <div v-if="isLoading && data.length > 0" class="absolute inset-0 z-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex items-center justify-center transition-colors">
      <span class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"></span>
    </div>
    <table class="w-full text-left text-sm text-slate-700 dark:text-slate-300">
      <thead class="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 transition-colors">
        <tr class="divide-x divide-slate-200 dark:divide-slate-700">
          <th 
            v-for="label in labels" 
            :key="label.key" 
            class="p-4 font-semibold whitespace-nowrap text-left relative"
          >
            <template v-if="label.headerSlot">
              <slot :name="'header-' + label.key" :label="label"></slot>
            </template>
            <template v-else>
              {{ label.title }}
            </template>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50 transition-colors">
        <tr 
          v-for="(item, index) in data" 
          :key="index" 
          class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors divide-x divide-slate-100 dark:divide-slate-700/50"
        >
          <td 
            v-for="label in labels" 
            :key="label.key" 
            class="p-4 relative"
          >
            <template v-if="label.slot">
              <slot :name="label.key" :item="item" :index="index"></slot>
            </template>
            <template v-else>
              {{ item[label.key] }}
            </template>
          </td>
        </tr>
        <tr v-if="isLoading && data.length === 0">
          <td :colspan="labels.length" class="p-12 text-center">
            <div class="flex justify-center">
              <span class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"></span>
            </div>
          </td>
        </tr>
        <tr v-else-if="data.length === 0">
          <td :colspan="labels.length" class="p-8 text-center text-slate-500 dark:text-slate-400">
            <slot name="empty">No data available.</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  
  <!-- Pagination -->
  <div v-if="meta && (meta.totalPages > 1 || data.length > 0)" class="flex flex-wrap justify-between items-center gap-4 mt-6">
    <!-- Left: Per Page Selector -->
    <div class="flex items-center gap-2">
      <label class="text-sm text-slate-500 dark:text-slate-400 font-medium transition-colors">Per page:</label>
      <select 
        :value="meta.limit" 
        @change="emit('limit-change', Number(($event.target as HTMLSelectElement).value))"
        class="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors"
      >
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
        <option :value="100">100</option>
      </select>
    </div>

    <!-- Center: Controls -->
    <div class="flex items-center gap-4">
      <BaseButton 
        variant="outline"
        size="sm"
        @click="() => { handlePageChange(meta!.page - 1); scrollToTop() }"
        :disabled="meta.page <= 1 || isLoading"
      >
        Previous
      </BaseButton>
      <span class="text-sm text-slate-600 dark:text-slate-400 font-medium transition-colors">Page {{ meta.page }} of {{ meta.totalPages }}</span>
      <BaseButton 
        variant="outline"
        size="sm"
        @click="() => { handlePageChange(meta!.page + 1); scrollToTop() }"
        :disabled="meta.page >= meta.totalPages || isLoading"
      >
        Next
      </BaseButton>
    </div>

    <!-- Right: Go to Page -->
    <div class="flex items-center gap-2">
      <label class="text-sm text-slate-500 dark:text-slate-400 font-medium transition-colors">Go to:</label>
      <input 
        type="number" 
        v-model="pageInput" 
        @keyup.enter="goToPage"
        min="1" 
        :max="meta.totalPages"
        class="w-16 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors"
      />
      <BaseButton 
        variant="primary"
        size="sm"
        @click="goToPage"
        :disabled="isLoading"
      >
        Go
      </BaseButton>
    </div>
  </div>
</template>
