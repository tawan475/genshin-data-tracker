<script setup lang="ts">
import type { PlannerData, PlannerMaterial } from '@gdt/game-data'
import { computed } from 'vue'
import { ArrowRight, Check, TriangleAlert } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import type { DoneCost } from './done'

/**
 * The check before a Done: what it sets (from → to) and what it takes out
 * of the bag (crafts and conversions it assumes listed under it). What the
 * bag can't cover is shown apart; Done still takes what there is.
 */
const props = defineProps<{
  open: boolean
  title: string
  /** "Level", "Talents", or the weapon's name. */
  part: string
  from: string
  to: string
  cost: DoneCost | null
  planner: PlannerData
  saving: boolean
}>()
const emit = defineEmits<{ close: []; confirm: [] }>()

const KIND_ORDER = [
  'mora',
  'exp',
  'ore',
  'gem',
  'boss',
  'local',
  'common',
  'book',
  'weekly',
  'crown',
  'weapon',
  'elite',
  'currency',
]

interface Item {
  key: string
  material: PlannerMaterial | null
  name: string
  icon: string
  count: number
}

function items(map: ReadonlyMap<string, number> | undefined): Item[] {
  return [...(map ?? [])]
    .map(([key, count]) => {
      const material = props.planner.materialsByKey.get(key) ?? null
      return {
        key,
        material,
        name: material?.name ?? key,
        icon:
          key === props.planner.mora.key ? materialIcon('Mora') : gameIcon(material?.icon ?? ''),
        count,
      }
    })
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.material?.kind ?? '') - KIND_ORDER.indexOf(b.material?.kind ?? '') ||
        (a.material?.family?.key ?? a.key).localeCompare(b.material?.family?.key ?? b.key) ||
        (a.material?.tier ?? 0) - (b.material?.tier ?? 0),
    )
}

const take = computed(() => items(props.cost?.take))
const short = computed(() => items(props.cost?.short))
const steps = computed(() =>
  (props.cost?.steps ?? []).map((s) =>
    s.kind === 'forge'
      ? `Forge ${formatNumber(s.count)} ${s.to.name} from ${formatNumber(s.uses)} ${props.planner.materialsByKey.get(s.input)?.name ?? s.input}`
      : s.kind === 'craft'
        ? `Craft ${formatNumber(s.count)} ${s.to.name} from ${formatNumber(s.uses)} ${s.from.name}`
        : `Convert ${formatNumber(s.count)} ${s.from.name} into ${s.to.name}`,
  ),
)
</script>

<template>
  <UiModal :open="open" :title="title" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <p class="tabular flex flex-wrap items-center gap-2 font-mono text-base">
        <span class="font-sans font-medium">{{ part }}</span>
        <span class="text-text-secondary">{{ from }}</span>
        <ArrowRight class="size-4 text-text-muted" aria-hidden="true" />
        <span class="font-semibold text-success-text">{{ to }}</span>
      </p>

      <section v-if="take.length" aria-label="Taken from the bag" class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-text-secondary">Uses</h3>
        <ul class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <li v-for="i in take" :key="i.key" class="flex items-center gap-2.5">
            <span
              class="size-9 shrink-0 overflow-hidden rounded-lg text-xs"
              :class="RARITY_SOFT[i.material?.rarity ?? 0] ?? 'bg-surface-sunken'"
            >
              <MaterialIcon :src="i.icon" :name="i.name" />
            </span>
            <span class="min-w-0 flex-1 truncate text-sm">{{ i.name }}</span>
            <span class="tabular font-mono text-sm font-semibold" :title="formatNumber(i.count)"
              >−{{ formatCompact(i.count) }}</span
            >
          </li>
        </ul>
        <ul v-if="steps.length" class="flex flex-col gap-0.5 text-xs text-text-muted">
          <li v-for="(s, index) in steps" :key="index">{{ s }}</li>
        </ul>
      </section>
      <p v-else class="text-sm text-text-muted">Nothing to spend</p>

      <section
        v-if="short.length"
        aria-label="Not in the bag"
        class="flex flex-col gap-2 rounded-lg border border-danger-border bg-danger-surface p-3"
      >
        <h3 class="flex items-center gap-1.5 text-sm font-semibold text-danger-text">
          <TriangleAlert class="size-4" aria-hidden="true" />
          Not in the bag
        </h3>
        <ul class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <li v-for="i in short" :key="i.key" class="flex items-center gap-2.5">
            <span
              class="size-8 shrink-0 overflow-hidden rounded-lg text-xs"
              :class="RARITY_SOFT[i.material?.rarity ?? 0] ?? 'bg-surface-sunken'"
            >
              <MaterialIcon :src="i.icon" :name="i.name" />
            </span>
            <span class="min-w-0 flex-1 truncate text-sm">{{ i.name }}</span>
            <span
              class="tabular font-mono text-sm font-semibold text-danger-text"
              :title="formatNumber(i.count)"
              >{{ formatCompact(i.count) }}</span
            >
          </li>
        </ul>
        <p class="text-xs text-text-secondary">Done takes what there is.</p>
      </section>
    </div>

    <template #footer>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :loading="saving" @click="emit('confirm')">
        <Check class="size-4" aria-hidden="true" />
        Done
      </UiButton>
    </template>
  </UiModal>
</template>
