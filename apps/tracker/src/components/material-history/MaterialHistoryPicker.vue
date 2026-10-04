<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { materialMatcher, materialName, matchRank } from '@/utils/materials'

/**
 * The original MaterialPicker: selected materials as removable chips, and a
 * search that adds more. Searches the materials this account's snapshots
 * hold (the old one searched a fixed catalog on the server).
 */
const props = defineProps<{
  selectedKeys: string[]
  /** Materials that can be added. */
  options: { key: string; name: string }[]
  /** The materials are still loading. */
  isSearching?: boolean
  icon: (key: string) => string
}>()

const emit = defineEmits<{
  (e: 'update:selectedKeys', keys: string[]): void
}>()

const MAX_RESULTS = 30

const search = ref('')
const showDropdown = ref(false)

const root = useTemplateRef<HTMLElement>('root')
onClickOutside(root, () => (showDropdown.value = false))

const results = computed(() => {
  const query = search.value.trim()
  const match = materialMatcher(query)
  const pool = props.options.filter((item) => !props.selectedKeys.includes(item.key))
  const hits = match ? pool.filter((item) => match(item.name) || match(item.key)) : pool
  return hits
    .sort(
      (a, b) =>
        (match ? matchRank(a.name, query) - matchRank(b.name, query) : 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_RESULTS)
})

const addKey = (key: string) => {
  if (props.selectedKeys.includes(key)) return
  emit('update:selectedKeys', [...props.selectedKeys, key])
  search.value = ''
  showDropdown.value = false
}

const removeKey = (key: string) => {
  emit(
    'update:selectedKeys',
    props.selectedKeys.filter((k) => k !== key),
  )
}
</script>

<template>
  <div ref="root" class="space-y-3">
    <div class="flex flex-wrap gap-2">
      <span
        v-for="key in selectedKeys"
        :key="key"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
      >
        <img v-if="icon(key)" :src="icon(key)" alt="" class="w-4 h-4 object-contain" />
        {{ materialName(key) }}
        <button
          type="button"
          class="ml-0.5 text-slate-500 hover:text-red-500"
          :aria-label="`Remove ${materialName(key)}`"
          @click="removeKey(key)"
        >
          ×
        </button>
      </span>
    </div>

    <div class="relative">
      <input
        v-model="search"
        type="text"
        placeholder="Search materials to add..."
        aria-label="Search materials to add"
        class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500"
        @focus="showDropdown = true"
        @input="showDropdown = true"
        @keydown.esc="showDropdown = false"
      />

      <div
        v-if="showDropdown && (results.length > 0 || isSearching || search)"
        class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg"
      >
        <div v-if="isSearching" class="px-3 py-2 text-sm text-slate-500">Searching...</div>
        <button
          v-for="item in results"
          :key="item.key"
          type="button"
          class="w-full text-left px-3 py-2 text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
          @click="addKey(item.key)"
        >
          <img
            v-if="icon(item.key)"
            :src="icon(item.key)"
            alt=""
            class="w-5 h-5 object-contain shrink-0"
          />
          <span>{{ item.name }}</span>
        </button>
        <div v-if="!isSearching && results.length === 0" class="px-3 py-2 text-sm text-slate-500">
          No materials found.
        </div>
      </div>
    </div>
  </div>
</template>
