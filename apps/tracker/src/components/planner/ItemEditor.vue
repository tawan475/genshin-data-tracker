<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { itemRequirement, type PlanGoal, type PlanOptions } from '@gdt/game-data/planner-math'
import type { Good, ItemTarget } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import CostList from './CostList.vue'
import NoteInput from './NoteInput.vue'
import { remove, upsert } from './use-planner-targets'

type Op = ReturnType<typeof upsert> | ReturnType<typeof remove>

/**
 * An extra need for one material, on top of every goal: how many, a note,
 * and whether it is counted. The cost colours work as for a goal.
 */
const props = defineProps<{
  open: boolean
  itemKey: string | null
  planner: PlannerData
  good: Good
  /** The stored need, or null for a new one. */
  target: ItemTarget | null
  /** Every other goal, for the cost colour. */
  others: readonly PlanGoal[]
  options: PlanOptions
  saving: boolean
}>()
const emit = defineEmits<{ close: []; save: [ops: Op[]]; remove: [ops: Op[]] }>()

const count = ref('')
const note = ref('')
const active = ref(true)

watch(
  () => [props.open, props.itemKey] as const,
  ([open]) => {
    if (!open) return
    count.value = props.target ? String(props.target.count) : '1'
    note.value = props.target?.note ?? ''
    active.value = props.target?.active ?? true
  },
  { immediate: true },
)

const material = computed(() =>
  props.itemKey ? props.planner.materialsByKey.get(props.itemKey) : undefined,
)
const icon = computed(() =>
  material.value?.key === props.planner.mora.key
    ? materialIcon('Mora')
    : gameIcon(material.value?.icon ?? ''),
)
const have = computed(() => (props.itemKey ? (props.good.materials[props.itemKey] ?? 0) : 0))

const countValue = computed(() => {
  const n = Number(String(count.value ?? '').trim())
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000_000 ? n : null
})
const requirements = computed(() =>
  props.itemKey && countValue.value
    ? [itemRequirement(props.planner, props.itemKey, countValue.value)]
    : [],
)

function save() {
  const key = props.itemKey
  if (!key || countValue.value === null) return
  const target: ItemTarget = {
    count: countValue.value,
    active: active.value,
    note: note.value.trim() || undefined,
  }
  emit('save', [upsert({ kind: 'item', key, target })])
}

function removeItem() {
  if (props.itemKey) emit('remove', [remove({ kind: 'item', key: props.itemKey })])
}
</script>

<template>
  <UiModal :open="open" :title="material?.name ?? ''" @close="emit('close')">
    <div v-if="material" class="flex flex-col gap-4">
      <div class="flex items-end gap-3">
        <span
          class="size-14 shrink-0 overflow-hidden rounded-lg text-xs"
          :class="RARITY_SOFT[material.rarity] ?? 'bg-surface-sunken'"
        >
          <MaterialIcon :src="icon" :name="material.name" />
        </span>
        <label class="flex w-32 flex-col gap-1">
          <span class="text-sm text-text-secondary">Count</span>
          <UiInput
            v-model="count"
            type="number"
            inputmode="numeric"
            min="1"
            :invalid="countValue === null"
          />
        </label>
        <span class="ml-auto flex flex-col items-end gap-1">
          <span class="text-sm text-text-secondary">Have</span>
          <span class="tabular flex min-h-10 items-center font-mono text-sm">{{
            formatNumber(have)
          }}</span>
        </span>
      </div>
      <NoteInput v-model="note" />
      <UiSwitch v-model="active" label="Counted" />
      <section class="flex flex-col gap-2" aria-label="Cost">
        <h3 class="text-sm font-semibold text-text-secondary">Cost</h3>
        <CostList
          :planner="planner"
          :requirements="requirements"
          :others="others"
          :inventory="good.materials"
          :options="options"
        />
      </section>
    </div>

    <template #footer>
      <UiButton v-if="target" variant="ghost" class="mr-auto text-danger-text" @click="removeItem">
        <Trash2 class="size-4" aria-hidden="true" />
        Remove
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :loading="saving" :disabled="countValue === null" @click="save">
        {{ target ? 'Save' : 'Add' }}
      </UiButton>
    </template>
  </UiModal>
</template>
