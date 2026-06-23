<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

export interface TableLabel {
  key: string
  title: string
  slot?: boolean
  headerSlot?: boolean
}

const props = defineProps<{
  labels: TableLabel[]
  data: any[]
  isLoading?: boolean
}>()

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
  <div ref="tableContainer" class="relative overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm w-full min-h-[150px] transition-colors">
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
</template>
