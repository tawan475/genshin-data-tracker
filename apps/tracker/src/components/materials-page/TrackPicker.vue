<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Plus, Search } from 'lucide-vue-next'
import { MAX_SERIES } from '@/components/materials/use-materials-graph'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { formatNumber } from '@/lib/format'
import { materialMatcher, matchRank } from '@/utils/materials'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'
import type { MaterialItem } from './material-items'

/** Search any material and toggle it on the tracked charts. */
const props = defineProps<{
  open: boolean
  items: MaterialItem[]
  selected: string[]
  changes: Map<string, number>
  hint: string
  icon: (key: string) => string
}>()
const emit = defineEmits<{ close: []; toggle: [key: string] }>()

const LIMIT = 40
const query = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)

const full = computed(() => props.selected.length >= MAX_SERIES)

const results = computed(() => {
  const q = query.value.trim()
  const match = materialMatcher(q)
  const change = (item: MaterialItem) => Math.abs(props.changes.get(item.key) ?? 0)
  if (!match) {
    // No query: currencies, then what moved most, then the largest stacks.
    return [...props.items]
      .sort(
        (a, b) =>
          Number(b.wallet) - Number(a.wallet) ||
          change(b) - change(a) ||
          b.count - a.count ||
          a.name.localeCompare(b.name),
      )
      .slice(0, LIMIT)
  }
  return props.items
    .filter((item) => match(item.name) || match(item.key))
    .sort(
      (a, b) =>
        matchRank(a.name, q) - matchRank(b.name, q) ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    )
    .slice(0, LIMIT)
})
</script>

<template>
  <UiModal :open="open" title="Track" @close="emit('close')">
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <div class="relative min-w-0 flex-1">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput
            v-model="query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            autofocus
            placeholder="Search"
            aria-label="Search materials"
            class="pl-9"
          />
        </div>
        <span class="tabular shrink-0 font-mono text-sm text-text-muted" title="Tracked / max"
          >{{ selected.length }}/{{ MAX_SERIES }}</span
        >
      </div>

      <ul v-if="results.length" class="-mx-2 flex flex-col">
        <li v-for="item in results" :key="item.key">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-overlay disabled:opacity-50 disabled:hover:bg-transparent"
            :aria-pressed="selected.includes(item.key)"
            :disabled="!selected.includes(item.key) && full"
            :title="!selected.includes(item.key) && full ? `Up to ${MAX_SERIES}` : item.name"
            @click="emit('toggle', item.key)"
          >
            <span class="size-10 shrink-0 rounded-lg bg-surface-overlay p-0.5 text-xs">
              <MaterialIcon :src="icon(item.key)" :name="item.name" />
            </span>
            <span class="min-w-0 flex-1 truncate text-sm">{{ item.name }}</span>
            <span class="flex shrink-0 flex-col items-end">
              <span class="tabular font-mono text-sm font-semibold">{{
                formatNumber(item.count)
              }}</span>
              <DeltaText :value="changes.get(item.key) ?? null" :hint="hint" class="text-xs" />
            </span>
            <Check
              v-if="selected.includes(item.key)"
              class="size-5 shrink-0 text-accent-text"
              aria-hidden="true"
            />
            <Plus v-else class="size-5 shrink-0 text-text-muted" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else class="py-6 text-center text-text-secondary">No matches</p>
    </div>
  </UiModal>
</template>
