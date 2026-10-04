<script setup lang="ts">
import { computed } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { ProgressCount } from '@gdt/game-data/achievement-progress'
import { formatNumber } from '@/lib/format'
import CategoryIcon from './CategoryIcon.vue'

export interface CategoryItem {
  /** null: every category. */
  id: number | null
  name: string
  /** Icon URL, or '' for none. */
  icon: string
  count: ProgressCount
}

/**
 * The category ("series") list beside the achievements on wide screens:
 * icon, name, done / total. Completed series are left out unless shown.
 */
const props = defineProps<{
  categories: CategoryItem[]
  total: ProgressCount
  /** Completed series, listed or not. */
  doneCount: number
}>()
const selected = defineModel<number | null>({ required: true })
const showDone = defineModel<boolean>('showDone', { required: true })

const items = computed<CategoryItem[]>(() => [
  { id: null, name: 'All', icon: '', count: props.total },
  ...props.categories,
])

const width = (c: ProgressCount) => `${c.total ? (c.done / c.total) * 100 : 0}%`
const title = (c: ProgressCount) =>
  `${formatNumber(c.done)} / ${formatNumber(c.total)} · ${formatNumber(c.primogems)} / ${formatNumber(c.primogemsTotal)} primogems`
</script>

<template>
  <nav aria-label="Categories">
    <ul class="flex flex-col gap-0.5">
      <li v-for="item in items" :key="item.id ?? 'all'">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors"
          :class="
            selected === item.id
              ? 'bg-surface-overlay text-text-primary'
              : 'text-text-secondary hover:bg-surface-overlay/60 hover:text-text-primary'
          "
          :aria-pressed="selected === item.id"
          :title="title(item.count)"
          @click="selected = item.id"
        >
          <CategoryIcon :src="item.icon" />
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm"
              :class="selected === item.id ? 'font-semibold' : 'font-medium'"
              >{{ item.name }}</span
            >
            <span class="mt-1 flex items-center gap-2">
              <span class="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  class="block h-full rounded-full"
                  :class="item.count.done === item.count.total ? 'bg-success-text' : 'bg-accent'"
                  :style="{ width: width(item.count) }"
                />
              </span>
              <span class="tabular font-mono text-xs text-text-muted"
                >{{ item.count.done }}/{{ item.count.total }}</span
              >
            </span>
          </span>
        </button>
      </li>
    </ul>
    <button
      v-if="doneCount > 0"
      type="button"
      class="mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-overlay/60 hover:text-text-primary"
      :aria-pressed="showDone"
      :title="showDone ? 'Hide completed series' : 'Show completed series'"
      @click="showDone = !showDone"
    >
      <span class="flex size-8 shrink-0 items-center justify-center">
        <component :is="showDone ? EyeOff : Eye" class="size-4" aria-hidden="true" />
      </span>
      <span class="flex-1 text-left">Completed</span>
      <span class="tabular font-mono text-xs">{{ doneCount }}</span>
    </button>
  </nav>
</template>
