<script setup lang="ts">
import type { FarmingData } from '@gdt/game-data/farming'
import type { ArtifactGoal, GoodArtifact } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Check, PencilLine, Plus, X } from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { artifactIcon, artifactSetIcon } from '@/lib/assets'
import { formatSetName, formatSlotName, formatStatShort } from '@/utils/artifact-stats'
import { maxLevel } from '@/utils/artifact-rolls'
import {
  MAIN_STAT_CHOICES,
  NO_ARTIFACT_GOAL,
  artifactProgress,
  flipTick,
  isStatSlot,
  tidyArtifactGoal,
  toggleStat,
  withSet,
  withSetTick,
  withSlotTick,
  withoutSet,
  type ArtifactSlot,
  type SetProgress,
  type SlotProgress,
} from './artifact-goals'
import { domainsForSet } from './artifact-domains'
import ArtifactSetPicker from './ArtifactSetPicker.vue'

/**
 * A character's artifact goal (the goal editor's Artifacts tab): the sets
 * wanted, each with the domain dropping it and a tick; then the five slots,
 * each with what the character wears there, the main stats wanted (Sands,
 * Goblet, Circlet) and a tick. Ticks come from the capture (a top-level
 * piece of a chosen set with a chosen main stat, see artifact-goals.ts) or
 * by hand (the pencil); a tap flips one, back to the capture's when they
 * agree. Saves as you go.
 */
const props = defineProps<{
  goal: ArtifactGoal | undefined
  /** What the character wears now (empty for a custom character). */
  worn: ReadonlyMap<ArtifactSlot, GoodArtifact>
  farming: FarmingData | null
}>()
const emit = defineEmits<{ change: [goal: ArtifactGoal | undefined] }>()

const goal = computed(() => props.goal ?? NO_ARTIFACT_GOAL)
const progress = computed(() => artifactProgress(goal.value, props.worn))
const adding = ref(false)
watch(
  () => goal.value.sets.length,
  (n) => {
    if (n === 0) adding.value = false
  },
)

function change(next: ArtifactGoal) {
  emit('change', tidyArtifactGoal(next))
}

function pickSet(key: string) {
  const chosen = goal.value.sets.some((s) => s.key === key)
  change(chosen ? withoutSet(goal.value, key) : withSet(goal.value, key))
}

const wornSets = computed(() => [...new Set([...props.worn.values()].map((p) => p.setKey))])
const chosenSets = computed(() => goal.value.sets.map((s) => s.key))
const domainOf = (key: string) => domainsForSet(props.farming, key)[0]?.name ?? ''

const pieceText = (p: GoodArtifact) =>
  `${formatSetName(p.setKey)} · ${formatStatShort(p.mainStatKey)} · +${p.level}`

function slotTitle(s: SlotProgress): string {
  const name = formatSlotName(s.slot)
  if (s.hand === true) return `${name}: done (ticked by hand)`
  if (s.hand === false)
    return `${name}: not done (ticked by hand${s.auto ? '; the capture says done' : ''})`
  if (s.auto && s.piece) return `${name}: done, from the capture (${pieceText(s.piece)})`
  return `${name}: ${missText(s) || 'not done'}`
}

function missText(s: SlotProgress): string {
  const p = s.piece
  if (!p) return 'nothing worn'
  if (s.miss === 'set') return 'other set'
  if (s.miss === 'stat') return 'other main stat'
  if (s.miss === 'level') return `+${p.level} of +${maxLevel(p.rarity)}`
  return ''
}

function setTitle(s: SetProgress): string {
  const name = formatSetName(s.key)
  if (s.hand === true) return `${name}: done (ticked by hand)`
  if (s.hand === false) return `${name}: farming (ticked by hand)`
  return s.auto ? `${name}: done, every slot is` : `${name}: farming`
}

const tickClass = (done: boolean, hand: boolean | null) =>
  done
    ? hand === null
      ? 'border-dashed border-success-text text-success-text'
      : 'border-transparent bg-emerald-500/15 text-success-text'
    : 'border-border-strong text-transparent hover:text-text-muted'

const AUTO_RULE =
  'A slot ticks itself when the capture shows a top-level piece (+20 on a 5★) there of a chosen set with a chosen main stat; the fifth slot can be any set once the other four are chosen sets'
</script>

<template>
  <section class="flex flex-col gap-4" aria-label="Artifacts">
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-text-muted">Sets</span>
      <ul v-if="progress.sets.length" class="flex flex-col gap-1">
        <li
          v-for="s in progress.sets"
          :key="s.key"
          class="flex items-center gap-2 rounded-lg border border-border-default py-1 pr-1 pl-1.5"
        >
          <GameIcon
            :src="artifactSetIcon(s.key)"
            :name="formatSetName(s.key)"
            :rarity="5"
            size="sm"
          />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm">{{ formatSetName(s.key) }}</span>
            <span class="tabular truncate text-xs text-text-muted">
              <template v-if="domainOf(s.key)">{{ domainOf(s.key) }}</template>
              <template v-if="s.worn">
                <template v-if="domainOf(s.key)"> · </template>{{ s.worn }} worn</template
              >
            </span>
          </span>
          <button
            type="button"
            class="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg"
            :aria-pressed="s.done"
            :aria-label="setTitle(s)"
            :title="setTitle(s)"
            @click="change(withSetTick(goal, s.key, flipTick(s.done, s.auto)))"
          >
            <span
              class="inline-flex size-7 items-center justify-center rounded-full border-2"
              :class="tickClass(s.done, s.hand)"
            >
              <Check class="size-4" aria-hidden="true" />
            </span>
            <PencilLine
              v-if="s.hand !== null"
              class="absolute top-0.5 right-0.5 size-3 text-accent-text"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            :aria-label="`Remove ${formatSetName(s.key)}`"
            :title="`Remove ${formatSetName(s.key)}`"
            @click="change(withoutSet(goal, s.key))"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <ArtifactSetPicker
        v-if="adding"
        :farming="farming"
        :chosen="chosenSets"
        :worn="wornSets"
        @pick="pickSet"
      />
      <div class="flex">
        <UiButton v-if="!adding" size="sm" @click="adding = true">
          <Plus class="size-4" aria-hidden="true" />
          Set
        </UiButton>
        <UiButton v-else size="sm" variant="ghost" @click="adding = false">Close</UiButton>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="flex items-center gap-2 text-xs font-medium text-text-muted" :title="AUTO_RULE">
        Slots
        <span class="tabular font-mono">{{ progress.done }}/5</span>
      </span>
      <ul
        class="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-default"
      >
        <li v-for="s in progress.slots" :key="s.slot" class="flex flex-col gap-1.5 px-2 py-1.5">
          <div class="flex min-h-10 items-center gap-2">
            <span class="w-14 shrink-0 text-sm text-text-muted">{{ formatSlotName(s.slot) }}</span>
            <GameIcon
              v-if="s.piece"
              :src="artifactIcon(s.piece.setKey, s.slot)"
              :name="formatSetName(s.piece.setKey)"
              :rarity="s.piece.rarity"
              size="xs"
            />
            <span
              class="tabular min-w-0 flex-1 truncate text-sm"
              :title="s.piece ? pieceText(s.piece) : ''"
            >
              <template v-if="s.piece">
                {{ formatStatShort(s.piece.mainStatKey) }}
                <span
                  class="font-mono text-xs"
                  :class="s.miss === 'level' ? 'text-warning-text' : 'text-text-muted'"
                  >+{{ s.piece.level
                  }}<template v-if="s.miss === 'level'"
                    >/{{ maxLevel(s.piece.rarity) }}</template
                  ></span
                >
              </template>
              <span
                v-if="!s.done && s.miss !== 'level' && missText(s)"
                class="ml-1 text-xs"
                :class="s.piece ? 'text-warning-text' : 'text-text-muted'"
                >{{ missText(s) }}</span
              >
            </span>
            <button
              type="button"
              class="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg"
              :aria-pressed="s.done"
              :aria-label="slotTitle(s)"
              :title="slotTitle(s)"
              @click="change(withSlotTick(goal, s.slot, flipTick(s.done, s.auto)))"
            >
              <span
                class="inline-flex size-7 items-center justify-center rounded-full border-2"
                :class="tickClass(s.done, s.hand)"
              >
                <Check class="size-4" aria-hidden="true" />
              </span>
              <PencilLine
                v-if="s.hand !== null"
                class="absolute top-0.5 right-0.5 size-3 text-accent-text"
                aria-hidden="true"
              />
            </button>
          </div>
          <div
            v-if="isStatSlot(s.slot)"
            class="flex flex-wrap gap-1"
            role="group"
            :aria-label="`${formatSlotName(s.slot)} main stat`"
          >
            <FilterChip
              v-for="stat in MAIN_STAT_CHOICES[s.slot]"
              :key="stat"
              class="min-h-8! px-2! text-xs!"
              :pressed="goal[s.slot]?.includes(stat) ?? false"
              @toggle="change(toggleStat(goal, s.slot, stat))"
              >{{ formatStatShort(stat) }}</FilterChip
            >
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
