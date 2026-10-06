<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { PlanGoal } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import {
  ArrowRight,
  Check,
  CircleArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  PencilLine,
  Star,
} from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { ELEMENT_FILL, RARITY_SOFT } from '@/components/characters/tokens'
import { characterIcon, gameIcon, materialIcon, weaponIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { characterParts, weaponPart, type DonePart } from './done'
import { READINESS } from './farm-format'
import { fromTouch, useItemPopover } from './item-popover'
import { levelLabel, type GoalEntry, type NextHint, type WeaponGoalView } from './model'
import type { GoalNeeds, NeedChip } from './needs'

/**
 * One goal on the Goals tab: a character (Level, Talents) with its weapon
 * goals, or a weapon on its own. Each part reads current → goal and has a
 * Done (it spends the materials, see DoneDialog); a part set by hand shows
 * the pencil. Under them, what the goal is still short of as tappable
 * chips (the inventory editor) and its readiness: ready with every goal,
 * ready on its own, or short. The header opens the editor; the star marks
 * a favorite, the eye counts it in the totals or not.
 *
 * In priority order (`order`) a handle with the card's place leads the
 * header: drag it (mouse, finger) or use the arrow keys on it. While
 * selecting (`selecting`), the header picks the card instead of opening it.
 */
const props = defineProps<{
  entry: GoalEntry
  planner: PlannerData
  /** The account's Adventure Rank, when set. */
  ar: number | null
  /** What can be levelled now, when only part of the goal can. */
  hint: NextHint | null
  /** Readiness and missing materials (null for a done goal). */
  needs: GoalNeeds | null
  /** The card's cost as one goal, for the inventory editor's "Goal" counts. */
  goal: PlanGoal | null
  /** Its place in priority order, while the list is in that order (it can be dragged). */
  order?: { rank: number; dragging: boolean; over: boolean } | null
  /** Picking cards for a bulk change. */
  selecting?: boolean
  selected?: boolean
}>()
const emit = defineEmits<{
  open: []
  select: []
  grab: [event: PointerEvent]
  nudge: [event: KeyboardEvent]
  toggle: []
  favorite: []
  /** A part's Done, with how the card reads it ("Talents", "6/8/8", "9/9/9"). */
  done: [part: DonePart, text: { label: string; from: string; to: string }]
}>()
const openItem = useItemPopover()

const c = computed(() => props.entry.character)

/** "AR 50" when a pending ascension needs more than the account has. */
const arShort = computed(() =>
  props.ar !== null && props.entry.ar > props.ar ? props.entry.ar : 0,
)

const level = (
  kind: 'character' | 'weapon',
  key: string,
  s: { level: number; ascension: number },
) => levelLabel(props.planner, kind, key, s.level, s.ascension)
const talentText = (t: { auto: number; skill: number; burst: number }) =>
  `${t.auto}/${t.skill}/${t.burst}`

interface Row {
  id: string
  label: string
  /** Weapon rows: the weapon. */
  weapon?: WeaponGoalView
  from: string
  to: string | null
  title: string
  edited: boolean
  part: DonePart | null
}

const rows = computed<Row[]>(() => {
  const list: Row[] = []
  const ch = c.value
  if (ch) {
    const parts = characterParts(props.planner, ch)
    const levelPart = parts.find((p) => p.kind === 'level') ?? null
    const talentPart = parts.find((p) => p.kind === 'talents') ?? null
    const now = ch.owned || ch.edited ? level('character', ch.key, ch.current) : '–'
    list.push({
      id: `${ch.id}|level`,
      label: 'Level',
      from: now,
      to: levelPart ? level('character', ch.key, ch.target) : null,
      title: `Level ${ch.current.level} (A${ch.current.ascension}) → ${ch.target.level} (A${ch.target.ascension})`,
      edited: ch.edited && pairDiffers(ch.current, ch.captured),
      part: levelPart,
    })
    const boosted = talentText(ch.boosted.current) !== talentText(ch.current.talents)
    list.push({
      id: `${ch.id}|talents`,
      label: 'Talents',
      from: talentText(ch.current.talents),
      to: talentPart ? talentText((talentPart.next.current as typeof ch.current).talents) : null,
      title: `Attack / Skill / Burst${boosted ? ` · shown in game as ${talentText(ch.boosted.current)} at C${ch.constellation}` : ''}`,
      edited:
        ch.edited &&
        (['auto', 'skill', 'burst'] as const).some(
          (t) => ch.current.talents[t] !== ch.captured.talents[t],
        ),
      part: talentPart,
    })
  }
  for (const w of props.entry.weapons) {
    const part = weaponPart(props.planner, w)
    const refine = w.target.refinement > w.current.refinement
    const lv = w.target.level > w.current.level || w.target.ascension > w.current.ascension
    const now = w.owned || w.edited ? level('weapon', w.key, w.current) : '–'
    list.push({
      id: w.id,
      label: w.name,
      weapon: w,
      from: `${now} · R${w.current.refinement}`,
      to: part
        ? `${lv ? level('weapon', w.key, w.target) : now} · R${refine ? w.target.refinement : w.current.refinement}`
        : null,
      title: `${w.name}: level ${w.current.level} (A${w.current.ascension}) → ${w.target.level} (A${w.target.ascension}), R${w.current.refinement} → R${w.target.refinement}`,
      edited: w.edited,
      part,
    })
  }
  return list
})

function pairDiffers(
  a: { level: number; ascension: number },
  b: { level: number; ascension: number },
) {
  return a.level !== b.level || a.ascension !== b.ascension
}

const portrait = computed(() => {
  if (c.value)
    return {
      src: c.value.custom ? '' : characterIcon(c.value.key),
      name: c.value.name,
      rarity: c.value.rarity,
    }
  const w = props.entry.weapons[0]!
  return { src: weaponIcon(w.key, w.target.ascension), name: w.name, rarity: w.rarity }
})

const status = computed(() =>
  props.entry.done ? READINESS.done : props.needs ? READINESS[props.needs.status] : null,
)

const chipIcon = (chip: NeedChip) =>
  chip.key === props.planner.mora.key ? materialIcon('Mora') : gameIcon(chip.material.icon)
const chipTitle = (chip: NeedChip) =>
  `${chip.material.name}${chip.exp ? ' (EXP)' : ''}: ${formatNumber(chip.count)} short${chip.status === 'alone' ? ' after the goals above' : ''}`

function openChip(chip: NeedChip, event: MouseEvent) {
  openItem?.({
    key: chip.key,
    anchor: event.currentTarget as HTMLElement,
    touch: fromTouch(event),
    context: props.goal ? { label: props.entry.name, requirement: props.goal.requirement } : null,
  })
}

const activeLabel = computed(() => (props.entry.active ? 'Counted' : 'Not counted'))
</script>

<template>
  <article
    class="flex w-full flex-col rounded-xl border bg-surface-raised shadow-sm transition-[color,border-color,opacity]"
    :class="[
      order?.over && !order.dragging
        ? 'border-accent-text ring-2 ring-accent/30'
        : selected
          ? 'border-accent-text'
          : 'border-border-default hover:border-border-strong',
      order?.dragging ? 'opacity-50' : '',
    ]"
    :data-goal-card="entry.id"
  >
    <div class="flex items-start gap-1 p-3 pr-1.5 pb-2" :class="order ? 'pl-1' : ''">
      <button
        v-if="order"
        type="button"
        class="-my-1 inline-flex w-8 shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-0.5 self-stretch rounded-md text-text-muted transition-colors select-none hover:bg-surface-overlay hover:text-text-primary active:cursor-grabbing"
        :data-goal-handle="entry.id"
        :aria-label="`${entry.name}: place ${order.rank}, move with the arrow keys`"
        :title="`#${order.rank} · drag, or arrow keys`"
        @pointerdown="emit('grab', $event)"
        @keydown="emit('nudge', $event)"
      >
        <span class="tabular font-mono text-xs">{{ order.rank }}</span>
        <GripVertical class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        :aria-haspopup="selecting ? undefined : 'dialog'"
        :aria-pressed="selecting ? selected : undefined"
        class="flex min-w-0 flex-1 items-center gap-3 text-left"
        :class="entry.active ? '' : 'opacity-50'"
        @click="selecting ? emit('select') : emit('open')"
      >
        <span class="relative shrink-0">
          <GameIcon
            :src="portrait.src"
            :name="portrait.name"
            :rarity="portrait.rarity ?? undefined"
            size="md"
            :class="c?.custom ? 'outline-1 outline-border-strong outline-dashed' : ''"
          />
          <span
            v-if="selecting"
            class="absolute -top-1 -left-1 inline-flex size-5 items-center justify-center rounded-full border-2"
            :class="
              selected
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-border-strong bg-surface-raised'
            "
            aria-hidden="true"
          >
            <Check v-if="selected" class="size-3" />
          </span>
        </span>
        <span class="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span class="flex w-full min-w-0 items-center gap-2">
            <span
              v-if="c?.element"
              class="size-2.5 shrink-0 rounded-full"
              :class="ELEMENT_FILL[c.element]"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate font-display text-base font-semibold">{{
              entry.name
            }}</span>
            <span
              v-if="c?.custom"
              class="shrink-0 text-xs text-text-muted"
              title="Custom character: not in the game data yet"
              >Custom</span
            >
          </span>
          <span
            v-if="status"
            class="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium"
            :class="status.badge"
          >
            <span class="size-2 rounded-full" :class="status.dot" aria-hidden="true" />
            {{ status.label }}
          </span>
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
      class="flex flex-col border-t border-border-subtle"
      :class="entry.active ? '' : 'opacity-60'"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex min-h-11 items-center gap-2 px-3 py-1"
        :title="row.title"
      >
        <GameIcon
          v-if="row.weapon"
          :src="weaponIcon(row.weapon.key, Math.max(row.weapon.current.ascension, 2))"
          :name="row.weapon.name"
          :rarity="row.weapon.rarity ?? undefined"
          size="xs"
        />
        <span v-else class="w-16 shrink-0 text-sm text-text-muted">{{ row.label }}</span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span v-if="row.weapon" class="truncate text-sm text-text-secondary">{{
            row.weapon.name
          }}</span>
          <span class="tabular flex min-w-0 flex-wrap items-center gap-x-1 font-mono text-sm">
            <span :class="row.to ? 'text-text-secondary' : ''">{{ row.from }}</span>
            <PencilLine
              v-if="row.edited"
              class="size-3.5 text-accent-text"
              aria-label="Set by hand"
              role="img"
            />
            <template v-if="row.to">
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true" />
              <span class="font-semibold">{{ row.to }}</span>
            </template>
            <span
              v-if="row.label === 'Level' && row.to && arShort"
              class="ml-1 text-xs text-warning-text"
              :title="`Needs AR ${arShort}`"
              >AR {{ arShort }}</span
            >
          </span>
        </span>
        <button
          v-if="row.part"
          type="button"
          class="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-border-strong px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          :aria-label="`${entry.name}: ${row.label} done`"
          @click="emit('done', row.part, { label: row.label, from: row.from, to: row.to ?? '' })"
        >
          <Check class="size-4" aria-hidden="true" />
          Done
        </button>
        <Check
          v-else
          class="ml-auto size-4 shrink-0 text-success-text"
          aria-label="Reached"
          role="img"
        />
      </li>
    </ul>

    <div v-if="needs && needs.chips.length" class="border-t border-border-subtle px-3 py-2.5">
      <ul class="flex flex-wrap gap-1.5" :aria-label="`${entry.name}: missing`">
        <li v-for="chip in needs.chips" :key="chip.key">
          <component
            :is="openItem ? 'button' : 'span'"
            :type="openItem ? 'button' : undefined"
            class="flex items-center gap-1 rounded-lg border py-0.5 pr-1.5 pl-0.5"
            :class="[
              chip.status === 'short' ? 'border-danger-border' : 'border-amber-500/40',
              openItem ? 'transition-colors hover:bg-surface-overlay' : '',
            ]"
            :title="chipTitle(chip)"
            :aria-haspopup="openItem ? 'dialog' : undefined"
            @click="openChip(chip, $event)"
          >
            <span
              class="size-8 overflow-hidden rounded-md text-[0.625rem]"
              :class="RARITY_SOFT[chip.material.rarity] ?? 'bg-surface-sunken'"
            >
              <MaterialIcon :src="chipIcon(chip)" :name="chip.material.name" />
            </span>
            <span
              class="tabular font-mono text-sm font-semibold"
              :class="chip.status === 'short' ? 'text-danger-text' : 'text-warning-text'"
              >{{ formatCompact(chip.count) }}</span
            >
            <span class="sr-only">{{ chipTitle(chip) }}</span>
          </component>
        </li>
      </ul>
    </div>

    <p
      v-if="hint"
      class="flex items-center gap-1.5 border-t border-border-subtle px-3 py-2 text-xs text-success-text"
      :title="hint.title"
    >
      <CircleArrowUp class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">Can do now: {{ hint.text }}</span>
      <span class="sr-only">({{ hint.title }})</span>
    </p>

    <p
      v-if="entry.note"
      class="line-clamp-2 border-t border-border-subtle px-3 py-2 text-xs break-words text-text-muted"
    >
      {{ entry.note }}
    </p>
  </article>
</template>
