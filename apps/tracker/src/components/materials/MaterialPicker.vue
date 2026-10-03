<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Plus } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { changeOver, type ChartFrame, type MaterialsHistory } from '@/data/materials'
import { formatNumber, formatSigned } from '@/lib/format'
import { isPlayerProperty, materialMatcher, materialName, matchRank } from '@/utils/materials'
import { MAX_SERIES } from './use-materials-graph'

/**
 * Every material that appears in any snapshot, searchable, with its current
 * count and change over the chart's range. Click to put it on the chart.
 */
const props = defineProps<{
  history: MaterialsHistory
  frame: ChartFrame
  selected: string[]
  icon: (key: string) => string
  /** Also list player properties older Irminsul builds stored as materials. */
  includeProperties: boolean
}>()
const emit = defineEmits<{ toggle: [key: string] }>()

const PAGE = 12
const query = ref('')
const shown = ref(PAGE)
watch(query, () => (shown.value = PAGE))

const names = computed(() => {
  const map = new Map<string, string>()
  for (const key of props.history.series.keys()) map.set(key, materialName(key))
  return map
})

const items = computed(() =>
  [...props.history.series.keys()]
    .filter((key) => props.includeProperties || !isPlayerProperty(key))
    .map((key) => ({
      key,
      name: names.value.get(key)!,
      count: props.history.latest.get(key) ?? 0,
      change: changeOver(props.history, key, props.frame),
    })),
)

const results = computed(() => {
  const q = query.value.trim()
  const match = materialMatcher(q)
  if (!match) {
    // No query: what moved the most over the range, then the largest stacks.
    return [...items.value].sort(
      (a, b) =>
        Math.abs(b.change) - Math.abs(a.change) ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    )
  }
  return items.value
    .filter((item) => match(item.name) || match(item.key))
    .sort((a, b) => matchRank(a.name, q) - matchRank(b.name, q) || a.name.localeCompare(b.name))
})
const visible = computed(() => results.value.slice(0, shown.value))
const remaining = computed(() => results.value.length - visible.value.length)
const full = computed(() => props.selected.length >= MAX_SERIES)

const deltaClass = (value: number) =>
  value > 0 ? 'text-success-text' : value < 0 ? 'text-danger-text' : 'text-text-muted'
</script>

<template>
  <UiPanel>
    <template #header>
      <h2 class="font-display text-xl font-bold">Add to chart</h2>
      <span class="tabular font-mono text-sm text-text-muted" title="Materials on the chart"
        >{{ selected.length }}/{{ MAX_SERIES }}</span
      >
    </template>
    <div class="flex flex-col gap-3">
      <UiInput
        v-model="query"
        type="search"
        autocomplete="off"
        placeholder="Search"
        aria-label="Search materials"
      />

      <ul v-if="visible.length" class="-mx-2 flex flex-col">
        <li v-for="item in visible" :key="item.key">
          <button
            type="button"
            class="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-overlay disabled:opacity-50 disabled:hover:bg-transparent"
            :aria-pressed="selected.includes(item.key)"
            :disabled="!selected.includes(item.key) && full"
            :title="
              !selected.includes(item.key) && full
                ? `Chart is full (${MAX_SERIES})`
                : `${item.name}: ${formatNumber(item.count)}, ${formatSigned(item.change)} in range`
            "
            @click="emit('toggle', item.key)"
          >
            <GameIcon :src="icon(item.key)" :name="item.name" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2 break-words">{{ item.name }}</span>
              <span class="tabular font-mono text-sm text-text-secondary">
                {{ formatNumber(item.count) }}
                <span :class="deltaClass(item.change)">{{ formatSigned(item.change) }}</span>
              </span>
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
      <div v-else class="flex flex-col items-center gap-3 py-6">
        <p class="text-text-secondary">No matches</p>
        <UiButton @click="query = ''">Clear search</UiButton>
      </div>

      <UiButton
        v-if="remaining > 0"
        :title="`${formatNumber(remaining)} more`"
        @click="shown += PAGE"
      >
        Show more
      </UiButton>
    </div>
  </UiPanel>
</template>
