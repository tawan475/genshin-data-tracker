<script setup lang="ts">
import { computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import type { ArtifactRow } from '@/data/artifacts'
import { artifactIcon } from '@/lib/assets'
import { keyToName } from '@/lib/format'
import { formatStatName, formatStatShort, formatStatValue } from '@/utils/artifact-stats'
import ArtifactRollDots from './ArtifactRollDots.vue'
import {
  getSubstatColorClass,
  hideBrokenImage,
  rarityBorderClass,
  rollCountTextClass,
} from './styles'

/** The original compact artifact card from "My Artifacts". */
const props = defineProps<{ row: ArtifactRow }>()

const artifact = computed(() => props.row.artifact)
const iconUrl = computed(() => artifactIcon(artifact.value.setKey, artifact.value.slotKey))
const rarity = computed(() => artifact.value.rarity || 5)
const owner = computed(() => (artifact.value.location ? keyToName(artifact.value.location) : ''))
</script>

<template>
  <article
    class="group relative bg-white dark:bg-slate-800 rounded-lg border shadow-sm hover:shadow-md transition-all flex flex-col text-xs"
    :class="rarityBorderClass(artifact.rarity)"
  >
    <div
      v-if="artifact.lock"
      class="absolute top-0 left-0 z-10 bg-amber-500 text-white p-0.5 rounded-br-md"
      title="Locked"
    >
      <Lock class="w-3 h-3" aria-hidden="true" />
    </div>

    <!-- Header: image + set / main / level -->
    <div class="flex gap-2 p-2 border-b border-slate-100 dark:border-slate-700/60">
      <div class="relative shrink-0 w-12 pb-1.5">
        <div
          class="relative w-12 h-12 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
        >
          <div class="absolute inset-0 rounded-md overflow-hidden">
            <img
              v-if="iconUrl"
              :src="iconUrl"
              :alt="row.setName"
              class="w-full h-full object-contain scale-110"
              loading="lazy"
              @error="hideBrokenImage"
            />
          </div>
          <span
            class="absolute top-0 left-0 z-[1] text-[8px] font-bold leading-none px-0.5 py-px rounded-br-md bg-black/60 text-amber-300"
          >
            +{{ artifact.level }}
          </span>
          <span
            v-if="artifact.rarity"
            class="absolute bottom-0 left-1/2 z-[2] -translate-x-1/2 translate-y-1/2 inline-flex items-center gap-px px-0.5 py-px rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-sm leading-none"
            :title="`${artifact.rarity}-star`"
          >
            <span v-for="n in artifact.rarity" :key="n" class="text-[5px] leading-none scale-90"
              >⭐</span
            >
          </span>
        </div>
      </div>

      <div class="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <p
          class="font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 min-h-[2.5em]"
          :title="row.setName"
        >
          {{ row.setName }}
        </p>
        <p
          class="text-[11px] text-slate-700 dark:text-slate-200 truncate"
          :title="formatStatName(artifact.mainStatKey)"
        >
          {{ formatStatShort(artifact.mainStatKey) }}
        </p>
      </div>

      <div class="shrink-0 text-right text-[10px] leading-tight">
        <div class="text-slate-500">CV</div>
        <div class="font-bold text-slate-900 dark:text-white">{{ row.cv.toFixed(1) }}</div>
        <div class="text-slate-500 mt-0.5">RV</div>
        <div class="font-bold text-slate-900 dark:text-white">{{ row.rv }}%</div>
      </div>
    </div>

    <!-- Substats with roll dots (GO SmolProgress style) -->
    <div class="flex-1 px-2 py-1.5 space-y-0.5 min-h-[4.5rem]">
      <div
        v-for="(sub, index) in artifact.substats"
        :key="sub.key"
        class="flex items-center gap-1 min-h-[1.125rem]"
      >
        <span
          class="truncate flex-1 min-w-0"
          :class="rollCountTextClass(row.rolls[index]?.length ?? 0)"
          :title="formatStatName(sub.key)"
        >
          {{ formatStatShort(sub.key) }}
        </span>
        <span :class="['font-semibold shrink-0 tabular-nums', getSubstatColorClass(sub.key)]">
          +{{ formatStatValue(sub.key, sub.value) }}
        </span>
        <ArtifactRollDots :stat-key="sub.key" :rolls="row.rolls[index] ?? []" :rarity="rarity" />
      </div>
      <p v-if="artifact.substats.length === 0" class="text-[10px] text-slate-400 italic py-1">
        No substats
      </p>
    </div>

    <!-- Footer -->
    <div
      class="px-2 py-1 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 flex items-center justify-between gap-1 text-[10px] text-slate-500"
    >
      <span v-if="owner" class="truncate" :title="owner">{{ owner }}</span>
      <span v-else class="truncate opacity-60">—</span>
    </div>
  </article>
</template>
