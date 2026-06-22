<script setup lang="ts">
export interface TableLabel {
  key: string
  title: string
  slot?: boolean
}

defineProps<{
  labels: TableLabel[]
  data: any[]
  isLoading?: boolean
}>()
</script>

<template>
  <div class="relative overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm w-full min-h-[150px]">
    <!-- Loading Overlay for when we have data but are fetching more -->
    <div v-if="isLoading && data.length > 0" class="absolute inset-0 z-10 bg-white/50 backdrop-blur-sm flex items-center justify-center">
      <span class="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></span>
    </div>
    <table class="w-full text-left text-sm text-slate-700">
      <thead class="bg-slate-50 border-b border-slate-200 text-slate-900">
        <tr class="divide-x divide-slate-200">
          <th 
            v-for="label in labels" 
            :key="label.key" 
            class="p-4 font-semibold whitespace-nowrap text-left"
          >
            {{ label.title }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr 
          v-for="(item, index) in data" 
          :key="index" 
          class="hover:bg-slate-50 transition-colors divide-x divide-slate-100"
        >
          <td 
            v-for="label in labels" 
            :key="label.key" 
            class="p-4"
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
              <span class="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></span>
            </div>
          </td>
        </tr>
        <tr v-else-if="data.length === 0">
          <td :colspan="labels.length" class="p-8 text-center text-slate-500">
            <slot name="empty">No data available.</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
