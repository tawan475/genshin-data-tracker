<script setup lang="ts">
import { formatCompact, formatNumber } from '@/lib/format'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'

export interface WalletItem {
  key: string
  label: string
  name: string
  count: number
  change: number | null
}

/** Currency and wish items as small tiles; a tile opens the material. */
defineProps<{
  items: WalletItem[]
  icon: (key: string) => string
  /** Tooltip end for the changes ("since Jul 12, 2026"). */
  hint: string
}>()
const emit = defineEmits<{ open: [key: string] }>()
</script>

<template>
  <ul
    class="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] sm:overflow-visible sm:px-0 sm:pb-0"
    aria-label="Wallet"
  >
    <li v-for="item in items" :key="item.key" class="shrink-0 snap-start">
      <button
        type="button"
        class="flex h-full w-32 items-center gap-2.5 rounded-xl border border-border-default bg-surface-raised p-2.5 text-left shadow-sm transition-colors hover:border-border-strong hover:bg-surface-overlay/40 sm:w-full"
        :title="`${item.name}: ${formatNumber(item.count)}`"
        @click="emit('open', item.key)"
      >
        <span class="size-10 shrink-0 text-xs">
          <MaterialIcon :src="icon(item.key)" :name="item.name" />
        </span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs text-text-muted">{{ item.label }}</span>
          <span class="tabular truncate font-mono text-lg leading-6 font-semibold">{{
            formatCompact(item.count)
          }}</span>
          <span class="min-h-4 text-xs leading-4">
            <DeltaText :value="item.change || null" :hint="hint" />
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>
