<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { computed } from 'vue'
import { ArrowRight, Check, Eye, EyeOff, PackageCheck } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import { ELEMENT_FILL } from '@/components/characters/tokens'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { levelLabel, type GoalEntry, type WeaponGoalView } from './model'

/**
 * One goal on the Goals tab: a character (level and talents, current ->
 * target) with its weapon goals, or a weapon on its own. The card opens the
 * editor; the eye counts it in the totals or not.
 */
const props = defineProps<{
  entry: GoalEntry
  planner: PlannerData
  /** Everything it needs is in stock (shared with the other goals). */
  ready: boolean
}>()
const emit = defineEmits<{ open: []; toggle: [] }>()

const c = computed(() => props.entry.character)

const TALENT_NAMES = { auto: 'Attack', skill: 'Skill', burst: 'Burst' } as const
const talents = computed(() => {
  const ch = c.value
  if (!ch) return []
  return (['auto', 'skill', 'burst'] as const).map((t) => ({
    name: TALENT_NAMES[t],
    from: ch.current.talents[t],
    to: ch.target.talents[t],
  }))
})

const characterLevel = computed(() => {
  const ch = c.value
  if (!ch) return null
  return {
    from: ch.owned
      ? levelLabel(props.planner, 'character', ch.key, ch.current.level, ch.current.ascension)
      : '–',
    to: levelLabel(props.planner, 'character', ch.key, ch.target.level, ch.target.ascension),
    up: ch.target.level > ch.current.level || ch.target.ascension > ch.current.ascension,
  }
})

function weaponLevel(w: WeaponGoalView) {
  return {
    from: w.owned
      ? levelLabel(props.planner, 'weapon', w.key, w.current.level, w.current.ascension)
      : '–',
    to: levelLabel(props.planner, 'weapon', w.key, w.target.level, w.target.ascension),
    up: w.target.level > w.current.level || w.target.ascension > w.current.ascension,
    refine: w.target.refinement > w.current.refinement,
  }
}

const portrait = computed(() => {
  const e = props.entry
  if (c.value)
    return { src: characterIcon(c.value.key), name: c.value.name, rarity: c.value.rarity }
  const w = e.weapons[0]!
  return { src: weaponIcon(w.key, w.target.ascension), name: w.name, rarity: w.rarity }
})

const activeLabel = computed(() => (props.entry.active ? 'Counted' : 'Not counted'))
</script>

<template>
  <article
    class="flex w-full flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm transition-colors hover:border-border-strong"
  >
    <div class="flex items-start gap-1 p-3 pr-1.5">
      <button
        type="button"
        aria-haspopup="dialog"
        class="flex min-w-0 flex-1 items-start gap-3 text-left"
        :class="entry.active ? '' : 'opacity-50'"
        @click="emit('open')"
      >
        <GameIcon
          :src="portrait.src"
          :name="portrait.name"
          :rarity="portrait.rarity ?? undefined"
          size="lg"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span class="flex items-center gap-2">
            <span
              v-if="c?.element"
              class="size-2.5 shrink-0 rounded-full"
              :class="ELEMENT_FILL[c.element]"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate font-display text-base font-semibold">{{
              entry.name
            }}</span>
            <span v-if="entry.done" class="shrink-0 text-success-text" title="Done">
              <Check class="size-4" aria-hidden="true" />
              <span class="sr-only">Done</span>
            </span>
            <span v-else-if="ready" class="shrink-0 text-success-text" title="In stock">
              <PackageCheck class="size-4" aria-hidden="true" />
              <span class="sr-only">In stock</span>
            </span>
          </span>

          <span
            v-if="characterLevel"
            class="tabular flex items-center gap-1 font-mono text-sm"
            :title="`Level ${c!.current.level} (A${c!.current.ascension}) → ${c!.target.level} (A${c!.target.ascension})`"
          >
            <span class="text-text-muted">Lv</span>
            <template v-if="characterLevel.up">
              <span class="text-text-secondary">{{ characterLevel.from }}</span>
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true" />
              <span class="font-semibold text-warning-text">{{ characterLevel.to }}</span>
            </template>
            <span v-else>{{ characterLevel.from }}</span>
          </span>

          <span v-if="talents.length" class="flex flex-wrap gap-1">
            <span
              v-for="t in talents"
              :key="t.name"
              class="tabular inline-flex h-6 items-center gap-0.5 rounded-md bg-surface-overlay px-1.5 font-mono text-sm leading-none"
              :title="`${t.name} ${t.from} → ${t.to}`"
            >
              <template v-if="t.to > t.from">
                <span class="text-text-muted">{{ t.from }}</span>
                <ArrowRight class="size-3 text-text-muted" aria-hidden="true" />
                <span class="font-semibold text-warning-text">{{ t.to }}</span>
              </template>
              <span v-else :class="t.from >= 10 ? 'font-semibold text-rarity-5' : ''">{{
                t.from
              }}</span>
            </span>
          </span>

          <template v-if="!c">
            <span
              v-for="w in entry.weapons"
              :key="w.id"
              class="tabular flex items-center gap-1 font-mono text-sm"
            >
              <span class="text-text-muted">Lv</span>
              <template v-if="weaponLevel(w).up">
                <span class="text-text-secondary">{{ weaponLevel(w).from }}</span>
                <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true" />
                <span class="font-semibold text-warning-text">{{ weaponLevel(w).to }}</span>
              </template>
              <span v-else>{{ weaponLevel(w).from }}</span>
              <span class="ml-2 text-text-muted">R</span
              ><span :class="weaponLevel(w).refine ? 'font-semibold text-warning-text' : ''">{{
                weaponLevel(w).refine
                  ? `${w.current.refinement}→${w.target.refinement}`
                  : w.target.refinement
              }}</span>
            </span>
          </template>
        </span>
      </button>
      <button
        type="button"
        class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        :aria-pressed="entry.active"
        :aria-label="`${entry.name}: ${activeLabel}`"
        :title="activeLabel"
        @click="emit('toggle')"
      >
        <Eye v-if="entry.active" class="size-5" aria-hidden="true" />
        <EyeOff v-else class="size-5" aria-hidden="true" />
      </button>
    </div>

    <ul
      v-if="c && entry.weapons.length"
      class="mt-auto flex flex-col gap-1.5 border-t border-border-subtle px-3 py-2"
      :class="entry.active ? '' : 'opacity-50'"
    >
      <li v-for="w in entry.weapons" :key="w.id" class="flex items-center gap-2 text-sm">
        <GameIcon
          :src="weaponIcon(w.key, Math.max(w.current.ascension, 2))"
          :name="w.name"
          :rarity="w.rarity ?? undefined"
          size="xs"
        />
        <span class="min-w-0 flex-1 truncate text-text-secondary" :title="w.name">{{
          w.name
        }}</span>
        <span class="tabular flex shrink-0 items-center gap-1 font-mono">
          <template v-if="weaponLevel(w).up">
            <span class="text-text-muted">{{ weaponLevel(w).from }}</span>
            <ArrowRight class="size-3 text-text-muted" aria-hidden="true" />
            <span class="font-semibold text-warning-text">{{ weaponLevel(w).to }}</span>
          </template>
          <span v-else>{{ weaponLevel(w).from }}</span>
          <span class="ml-1.5 text-text-muted">R</span
          ><span :class="weaponLevel(w).refine ? 'font-semibold text-warning-text' : ''">{{
            weaponLevel(w).refine
              ? `${w.current.refinement}→${w.target.refinement}`
              : w.target.refinement
          }}</span>
          <span v-if="w.done" class="ml-1 text-success-text" title="Done">
            <Check class="size-3.5" aria-hidden="true" />
            <span class="sr-only">Done</span>
          </span>
        </span>
      </li>
    </ul>
  </article>
</template>
