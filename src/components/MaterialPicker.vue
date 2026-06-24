<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useGenshinStore } from '../stores/genshin'
import { getMaterialIconUrl, onImageFallback } from '../utils/assets'

const props = defineProps<{
  selectedKeys: string[]
}>()

const emit = defineEmits<{
  (e: 'update:selectedKeys', keys: string[]): void
}>()

const authStore = useAuthStore()
const genshinStore = useGenshinStore()

const search = ref('')
const results = ref<{ key: string; name: string }[]>([])
const isSearching = ref(false)
const showDropdown = ref(false)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

const fetchCatalog = async () => {
  if (!genshinStore.selectedAccountId) return
  isSearching.value = true
  try {
    const url = new URL(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/materials/catalog`,
    )
    if (search.value) url.searchParams.set('search', search.value)
    url.searchParams.set('limit', '30')

    const res = await authStore.fetchWithAuth(url.toString())
    if (res.ok) {
      const parsed = await res.json()
      const data = parsed.data ?? parsed
      results.value = (data.items ?? []).filter(
        (item: { key: string }) => !props.selectedKeys.includes(item.key),
      )
    }
  } catch (err) {
    console.error('Material catalog search failed', err)
  } finally {
    isSearching.value = false
  }
}

const onSearchInput = () => {
  showDropdown.value = true
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(fetchCatalog, 300)
}

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

watch(
  () => genshinStore.selectedAccountId,
  () => {
    results.value = []
    search.value = ''
  },
)
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-2">
      <span
        v-for="key in selectedKeys"
        :key="key"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
      >
        <img
          v-if="getMaterialIconUrl(key)"
          :src="getMaterialIconUrl(key)"
          alt=""
          class="w-4 h-4 object-contain"
          @error="onImageFallback"
        />
        {{ key.replace(/([A-Z])/g, ' $1').trim() }}
        <button
          type="button"
          class="ml-0.5 text-slate-500 hover:text-red-500"
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
        class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500"
        @focus="showDropdown = true; fetchCatalog()"
        @input="onSearchInput"
      />

      <div
        v-if="showDropdown && (results.length > 0 || isSearching || search)"
        class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg"
      >
        <div v-if="isSearching" class="px-3 py-2 text-sm text-slate-500">
          Searching...
        </div>
        <button
          v-for="item in results"
          :key="item.key"
          type="button"
          class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"
          @click="addKey(item.key)"
        >
          <img
            v-if="getMaterialIconUrl(item.key)"
            :src="getMaterialIconUrl(item.key)"
            alt=""
            class="w-5 h-5 object-contain shrink-0"
            @error="onImageFallback"
          />
          <span>{{ item.name }}</span>
        </button>
        <div
          v-if="!isSearching && results.length === 0"
          class="px-3 py-2 text-sm text-slate-500"
        >
          No materials found.
        </div>
      </div>
    </div>
  </div>
</template>
