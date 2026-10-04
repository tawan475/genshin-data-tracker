<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { computed } from 'vue'
import { ArrowRight, CircleArrowUp, Check, Eye, EyeOff, PackageCheck, Star } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import { ELEMENT_FILL } from '@/components/characters/tokens'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { levelLabel, type GoalEntry, type NextHint, type WeaponGoalView } from './model'

/**
 * One goal on the Goals tab: a character (level and talents, current ->
 * target; with C3/C5 the level the game shows in brackets) with its weapon
 * goals, or a weapon on its own, plus what can be levelled now and its
 * note. The card opens the editor; the star marks a favorite (characters),
 * the eye counts it in the totals or not.
 */
const props = defineProps<{
  entry: GoalEntry
  planner: PlannerData
  /** Everything it needs is in stock (shared with the other goals). */
  ready: boolean
  /** The account's Adventure Rank, when set. */
  ar: number | null
  /** What can be levelled now, when only part of the goal can. */
  hint: NextHint | null
}>()
const emit = defineEmits<{ open: []; toggle: []; favorite: [] }>()

/** "AR 50" when a pending ascension needs more than the account has. */
const arShort = computed(() =>
  props.ar !== null && props.entry.ar > props.ar ? props.entry.ar : 0,
)

const c = computed(() => props.entry.character)

const TALENT_NAMES = { auto: 'Attack', skill: 'Skill', burst: 'Burst' } as const
const talents = computed(() => {
  const ch = c.value
  if (!ch) return []
  return (['auto', 'skill', 'burst'] as const).map((t) => {
    const from = ch.current.talents[t]
    const to = ch.target.talents[t]
    const up = to > from
    // The constellation's +3, on the level shown (the target when levelling).
    const boosted = up ? ch.boosted.target[t] : ch.boosted.current[t]
    const plus = boosted - (up ? to : from)
    return {
      name: TALENT_NAMES[t],
      from,
      to,
      up,
      boosted: plus > 0 ? boosted : null,
      title: `${TALENT_NAMES[t]} ${from} → ${to}${plus > 0 ? ` (${boosted} at C${ch.constellation})` : ''}`,
    }
  })
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
            <span
              v-if="entry.priority !== null"
              class="tabular ml-auto shrink-0 font-mono text-xs text-text-muted"
              :title="`Priority ${entry.priority}`"
              >#{{ entry.priority }}</span
            >
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
            <span
              v-if="arShort"
              class="ml-1.5 text-xs text-warning-text"
              :title="`Needs AR ${arShort}`"
              >AR {{ arShort }}</span
            >
          </span>

          <span v-if="talents.length" class="flex flex-wrap gap-1">
            <span
              v-for="t in talents"
              :key="t.name"
              class="tabular inline-flex h-6 items-center gap-0.5 rounded-md bg-surface-overlay px-1.5 font-mono text-sm leading-none"
              :title="t.title"
            >
              <template v-if="t.up">
                <span class="text-text-secondary">{{ t.from }}</span>
                <ArrowRight class="size-3 text-text-muted" aria-hidden="true" />
                <span class="font-semibold text-warning-text">{{ t.to }}</span>
              </template>
              <span v-else :class="t.from >= 10 ? 'font-semibold text-rarity-5' : ''">{{
                t.from
              }}</span>
              <span v-if="t.boosted" class="text-xs text-text-secondary">({{ t.boosted }})</span>
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
              <span
                v-if="arShort"
                class="ml-1.5 text-xs text-warning-text"
                :title="`Needs AR ${arShort}`"
                >AR {{ arShort }}</span
              >
            </span>
          </template>

          <span
            v-if="hint"
            class="tabular flex items-center gap-1 font-mono text-xs text-success-text"
            :title="hint.title"
          >
            <CircleArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ hint.text }}</span>
            <span class="sr-only">: {{ hint.title }}</span>
          </span>

          <span
            v-if="entry.note"
            class="line-clamp-1 text-xs break-all text-text-muted"
            :title="entry.note"
            >{{ entry.note }}</span
          >
        </span>
      </button>
      <button
        v-if="c"
        type="button"
        class="inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-overlay"
        :class="entry.favorite ? 'text-rarity-5' : 'text-text-muted hover:text-text-primary'"
        :aria-pressed="entry.favorite"
        :aria-label="`${entry.name}: favorite`"
        :title="entry.favorite ? 'Favorite' : 'Not a favorite'"
        @click="emit('favorite')"
      >
        <Star class="size-5" :fill="entry.favorite ? 'currentColor' : 'none'" aria-hidden="true" />
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
