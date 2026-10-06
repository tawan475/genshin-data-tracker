<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { WeaponState } from '@gdt/game-data/planner-math'
import type { WeaponTarget } from '@gdt/shared'
import { computed } from 'vue'
import { PencilLine, RotateCcw, X } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import { weaponIcon } from '@/lib/assets'
import LevelGrid from './LevelGrid.vue'
import { weaponGoalAtLeast, type LevelStep } from './level-grid'
import { levelLabel, type WeaponGoalView } from './model'
import NumberStepper from './NumberStepper.vue'

/**
 * One weapon goal in the goal editor: now and the goal as level buttons,
 * refinement as steppers. Changes are emitted as they happen (the page
 * saves them); setting now past the goal moves the goal with it.
 */
const props = defineProps<{
  planner: PlannerData
  weapon: WeaponGoalView
  /** The account's Adventure Rank, when set. */
  ar: number | null
  /** Show the remove button (a character's weapon goal). */
  removable?: boolean
  /** Who holds the copy it starts from, when someone else does. */
  holder?: string
}>()
const emit = defineEmits<{
  target: [target: WeaponTarget]
  now: [state: WeaponState | null]
  remove: []
}>()

const phases = computed(() => props.planner.weapons.get(props.weapon.key)?.ascension ?? null)
const w = computed(() => props.weapon)

function setNow(next: WeaponState) {
  emit('now', next)
  const raised = weaponGoalAtLeast(w.value.target, next)
  if (raised !== w.value.target && JSON.stringify(raised) !== JSON.stringify(w.value.target)) {
    emit('target', raised)
  }
}

const pickNow = (s: LevelStep) =>
  setNow({ level: s.level, ascension: s.ascension, refinement: w.value.current.refinement })
const pickGoal = (s: LevelStep) =>
  emit('target', { ...w.value.target, level: s.level, ascension: s.ascension })

const captured = computed(() =>
  w.value.owned
    ? `${levelLabel(props.planner, 'weapon', w.value.key, w.value.captured.level, w.value.captured.ascension)} · R${w.value.captured.refinement}`
    : 'Not owned',
)
const arNeed = computed(() => {
  const need = w.value.requirement?.ar ?? 0
  return props.ar !== null && need > props.ar ? need : 0
})
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-xl border border-border-default p-3"
    :aria-label="weapon.name"
  >
    <div class="flex items-center gap-2.5">
      <GameIcon
        :src="weaponIcon(weapon.key, Math.max(2, weapon.current.ascension))"
        :name="weapon.name"
        :rarity="weapon.rarity ?? undefined"
        size="sm"
      />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-sm font-semibold">{{ weapon.name }}</span>
        <span class="tabular flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
          <span :title="weapon.owned ? 'The copy in the capture' : 'No copy in the capture'">{{
            captured
          }}</span>
          <span v-if="holder" class="font-sans" :title="`Held by ${holder}`">{{ holder }}</span>
          <span v-if="weapon.edited" class="inline-flex items-center gap-1 text-accent-text">
            <PencilLine class="size-3.5" aria-label="Set by hand" role="img" />
            <button
              type="button"
              class="inline-flex min-h-6 items-center gap-1 rounded px-1 hover:bg-surface-overlay"
              title="Back to the capture"
              @click="emit('now', null)"
            >
              <RotateCcw class="size-3.5" aria-hidden="true" />
              Reset
            </button>
          </span>
          <span v-if="arNeed" class="text-warning-text" :title="`Needs AR ${arNeed}`"
            >AR {{ arNeed }}</span
          >
        </span>
      </span>
      <button
        v-if="removable"
        type="button"
        class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        :aria-label="`Remove ${weapon.name}`"
        :title="`Remove ${weapon.name}`"
        @click="emit('remove')"
      >
        <X class="size-5" aria-hidden="true" />
      </button>
    </div>

    <template v-if="phases">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-text-muted">Now</span>
          <NumberStepper
            :model-value="weapon.current.refinement"
            :min="weapon.captured.refinement"
            :max="5"
            prefix="R"
            :label="`${weapon.name} refinement now`"
            @update:model-value="setNow({ ...weapon.current, refinement: $event })"
          />
        </div>
        <LevelGrid
          :phases="phases"
          :level="weapon.current.level"
          :ascension="weapon.current.ascension"
          :min="weapon.captured"
          :label="`${weapon.name} level now`"
          @pick="pickNow"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-text-muted">Goal</span>
          <NumberStepper
            :model-value="weapon.target.refinement"
            :min="weapon.current.refinement"
            :max="5"
            prefix="R"
            :label="`${weapon.name} refinement goal`"
            @update:model-value="emit('target', { ...weapon.target, refinement: $event })"
          />
        </div>
        <LevelGrid
          :phases="phases"
          :level="weapon.target.level"
          :ascension="weapon.target.ascension"
          :from="weapon.current"
          :label="`${weapon.name} level goal`"
          @pick="pickGoal"
        />
      </div>
    </template>
  </section>
</template>
