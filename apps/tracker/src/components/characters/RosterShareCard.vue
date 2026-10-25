<script setup lang="ts">
import { computed, provide } from 'vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import ItemArt from '@/components/ui/ItemArt.vue'
import { TILE_CHIP } from '@/components/ui/item-tile'
import type { CharacterView } from '@/data/characters'
import { characterIcon } from '@/lib/assets'
import { formatDate } from '@/lib/format'
import { formatLevel } from '@/lib/level'
import FadeImage from './FadeImage.vue'
import { CONSTELLATION_MAX_STYLE, isMaxConstellation } from './max-badges'
import {
  ROSTER_GAP,
  ROSTER_PAD,
  ROSTER_TILE,
  rosterColumns,
  rosterSummary,
  rosterWidth,
} from './roster-card'
import { CARD_STILL, CARD_THEMES, type CardOwner, type CardTheme } from './share-card'

/**
 * Every character on one picture (the Characters page's roster share): the
 * game's bag cell per character (rarity art, portrait, element, the
 * constellation chip, "Lv. 90" on the cream strip), under a header with the
 * owner, the counts by element and rarity, and the capture date with the
 * site. On the share card's palette (CARD_THEMES), in its theme. Its width
 * follows the roster (roster-card `rosterColumns`), its height is as laid
 * out; exported at ROSTER_SCALE. `still` for the copy the export draws.
 */
const props = defineProps<{
  characters: readonly CharacterView[]
  theme: CardTheme
  owner: CardOwner
  takenAt: number | null
  still?: boolean
}>()

if (props.still) provide(CARD_STILL, true)

const columns = computed(() => rosterColumns(props.characters.length))
const ROOT = computed(() => ({
  ...CARD_THEMES[props.theme],
  width: `${rosterWidth(columns.value)}px`,
  padding: `${ROSTER_PAD}px`,
  fontSize: '16px',
}))
const GRID = computed(() => ({
  gridTemplateColumns: `repeat(${columns.value}, ${ROSTER_TILE}px)`,
  gap: `${ROSTER_GAP}px`,
}))
// A soft glow at the top in the app's accent and brand colours.
const GLOW = computed(() =>
  props.theme === 'dark'
    ? 'radial-gradient(ellipse 1100px 560px at 15% -15%, rgba(99,102,241,0.28), rgba(99,102,241,0) 100%), radial-gradient(ellipse 900px 480px at 95% -10%, rgba(245,158,11,0.16), rgba(245,158,11,0) 100%)'
    : 'radial-gradient(ellipse 1100px 560px at 15% -15%, rgba(99,102,241,0.18), rgba(99,102,241,0) 100%), radial-gradient(ellipse 900px 480px at 95% -10%, rgba(245,158,11,0.14), rgba(245,158,11,0) 100%)',
)

const summary = computed(() => rosterSummary(props.characters))
const ownerLine = computed(() =>
  [
    props.owner.name,
    props.owner.ar ? `AR ${props.owner.ar}` : null,
    props.owner.uid ? `UID ${props.owner.uid}` : null,
  ].filter((part): part is string => !!part),
)
const RARITY_TEXT: Record<number, string> = { 5: 'text-rarity-5', 4: 'text-rarity-4' }
const PILL = 'flex h-[40px] items-center gap-[8px] rounded-full bg-(--card-pill) px-[16px]'

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
</script>

<template>
  <div
    :data-theme="theme"
    class="relative overflow-hidden bg-(--card-ground) font-sans text-(--card-text) [font-variant-numeric:tabular-nums]"
    :style="ROOT"
  >
    <div class="pointer-events-none absolute inset-0" :style="{ background: GLOW }" />

    <header class="relative mb-[28px] flex flex-col gap-[20px]">
      <div class="flex items-end justify-between gap-[32px]">
        <h2 class="flex items-baseline gap-[16px] font-display leading-none">
          <span class="text-[44px] font-bold">{{ $t('game.characters') }}</span>
          <span class="text-[32px] font-semibold text-(--card-muted)">{{ characters.length }}</span>
        </h2>
        <div class="flex min-w-0 flex-col items-end gap-[4px] text-right">
          <p v-if="ownerLine.length" class="flex min-w-0 items-center gap-[12px] text-[22px]">
            <template v-for="(part, index) in ownerLine" :key="index">
              <span v-if="index" class="opacity-60">·</span>
              <span class="truncate" :class="index === 0 && owner.name ? 'font-semibold' : ''">{{
                part
              }}</span>
            </template>
          </p>
          <p class="flex items-center gap-[10px] text-[16px] whitespace-nowrap text-(--card-muted)">
            <template v-if="takenAt">
              <span>{{ formatDate(takenAt) }}</span>
              <span class="opacity-60">·</span>
            </template>
            <span>genshin-tracker.475.dev</span>
          </p>
        </div>
      </div>

      <ul class="flex flex-wrap items-center gap-[10px] text-[20px] font-semibold">
        <li v-for="e in summary.elements" :key="e.element" :class="PILL">
          <ElementIcon :element="e.element" class="size-[26px]!" />
          {{ e.count }}
        </li>
        <li
          v-if="summary.elements.length"
          class="mx-[4px] h-[28px] w-px bg-(--card-divider)"
          aria-hidden="true"
        />
        <li v-for="r in summary.rarities" :key="r.rarity" :class="PILL">
          <span :class="RARITY_TEXT[r.rarity]">{{ r.rarity }}★</span>
          {{ r.count }}
        </li>
        <li :class="PILL">
          <span class="text-(--card-muted)">{{ $t('characters.page.c6') }}</span>
          {{ summary.c6 }}
        </li>
        <li :class="PILL">
          <span class="text-(--card-muted)">{{ $t('characters.page.level90') }}</span>
          {{ summary.level90 }}
        </li>
      </ul>
    </header>

    <!-- The game's bag cells, sized in cqw like ItemTile -->
    <ul class="relative grid" :style="GRID">
      <li
        v-for="c in characters"
        :key="c.key"
        class="@container relative aspect-[80/98] rounded-[7cqw] shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
        :title="`${c.name} · ${formatLevel(c.level, c.ascension)} · C${c.constellation}`"
      >
        <ItemArt :rarity="c.rarity" class="rounded-[7cqw]" />
        <FadeImage
          v-if="characterIcon(c.key)"
          :src="characterIcon(c.key)"
          :alt="c.name"
          class="absolute inset-x-0 top-0 aspect-square w-full rounded-t-[7cqw] object-cover"
        />
        <span
          v-else
          class="absolute inset-x-0 top-0 flex aspect-square w-full items-center justify-center font-mono text-[22cqw] text-white/80"
          >{{ initials(c.name) }}</span
        >
        <ElementIcon
          v-if="c.element"
          :element="c.element"
          decorative
          class="absolute top-[4cqw] left-[4cqw] size-[22cqw]! drop-shadow-[0_0.5cqw_1cqw_rgba(0,0,0,0.6)]"
        />
        <span
          :class="TILE_CHIP"
          class="absolute top-[4cqw] right-[4cqw]"
          :style="isMaxConstellation(c.constellation) ? CONSTELLATION_MAX_STYLE : undefined"
          >C{{ c.constellation }}</span
        >
        <span
          class="absolute right-0 bottom-[20.4cqw] size-[19cqw] bg-[radial-gradient(circle_19cqw_at_0_0,transparent_97%,#e9e5dc_100%)]"
        />
        <span
          data-theme="light"
          class="absolute inset-x-0 bottom-0 flex h-[20.5cqw] items-center justify-center rounded-b-[7cqw] bg-[#e9e5dc] text-[15.5cqw] leading-none font-bold text-[#4a5366]"
          >Lv. {{ c.level }}</span
        >
      </li>
    </ul>
  </div>
</template>
