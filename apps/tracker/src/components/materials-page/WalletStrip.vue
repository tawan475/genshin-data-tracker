<script setup lang="ts">
import UiStat from '@/components/ui/UiStat.vue'
import { formatNumber } from '@/lib/format'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'

export interface WalletItem {
  key: string
  label: string
  name: string
  count: number
  change: number | null
}

/** Currency and wish items as stat tiles with their icon; a tile opens the material. */
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
    class="scroll-hide scroll-fade-x -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:scroll-fade-none sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] sm:overflow-visible sm:px-0 sm:pb-0"
    aria-label="Wallet"
  >
    <li v-for="item in items" :key="item.key" class="flex w-32 shrink-0 snap-start sm:w-auto">
      <UiStat
        button
        :label="item.label"
        :value="item.count"
        :hint="`${item.name}: ${formatNumber(item.count)}`"
        @click="emit('open', item.key)"
      >
        <template #media>
          <span class="block size-10 text-xs">
            <MaterialIcon :src="icon(item.key)" :name="item.name" />
          </span>
        </template>
        <span class="min-h-4 text-xs leading-4">
          <DeltaText :value="item.change || null" :hint="hint" />
        </span>
      </UiStat>
    </li>
  </ul>
</template>
