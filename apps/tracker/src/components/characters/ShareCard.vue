<script setup lang="ts">
import { computed } from 'vue'
import { Crown } from 'lucide-vue-next'
import CritValue from '@/components/ui/CritValue.vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import RollBars from '@/components/ui/RollBars.vue'
import {
  formatPanelValue,
  setBonusTitle,
  talentTitle,
  weaponLines,
  type BuildPanel,
  type DamageKind,
  type StatRow,
  type TalentLevel,
} from '@/data/character-build'
import {
  SLOT_LABELS,
  SLOT_ORDER,
  itemName,
  type CharacterView,
  type SetCount,
} from '@/data/characters'
import { artifactIcon, artifactSetIcon, characterBanner, weaponIcon } from '@/lib/assets'
import { isCritCirclet } from '@/lib/crit-tiers'
import { formatDate } from '@/lib/format'
import { ROLL_QUALITY_LABEL, inferArtifactRolls, type InferredRoll } from '@/utils/artifact-rolls'
import { formatRollValue, formatStatShort, formatStatValue } from '@/utils/artifact-stats'
import ConstellationIcons from './ConstellationIcons.vue'
import ElementDisc from './ElementDisc.vue'
import SplashArt from './SplashArt.vue'
import type { CardOwner } from './share-card'
import { talentIcons } from './talent-icons'
import { ELEMENT_GLOW, ELEMENT_TEXT, RARITY_SOFT } from './tokens'

/**
 * The build as one card on a fixed 1280×720 canvas, Enka-style: splash art
 * with the constellations and talents on the left; weapon, the in-game
 * stats and the sets in the middle; the five pieces on the right; the
 * owner and the site at the foot; the namecard behind it all. The wide
 * character details show it as is (scaled), and the PNG export draws it at
 * 1.5× (1920×1080, lib/share-image).
 *
 * It has its own theme (`data-theme`) whatever the page's, and pins
 * Tailwind's rem-based spacing, type and radii to pixels, so the image
 * doesn't follow the page's root font size. No viewport breakpoints and no
 * CSS masks with images, so the export draws what the page shows. Details
 * are in tooltips, as elsewhere.
 */
const props = defineProps<{
  character: CharacterView
  panel: BuildPanel | null
  talents: TalentLevel[]
  theme: 'light' | 'dark'
  owner: CardOwner
  /** When the capture was taken (epoch ms). */
  takenAt: number | null
}>()

/** Tailwind's rem-based theme pinned to the 16px it was drawn at. */
const PIXELS = {
  '--spacing': '4px',
  '--text-xs': '12px',
  '--text-sm': '14px',
  '--text-base': '16px',
  '--text-lg': '18px',
  '--text-xl': '20px',
  '--text-2xl': '24px',
  '--text-3xl': '30px',
  '--text-4xl': '36px',
  '--text-5xl': '48px',
  '--radius-sm': '4px',
  '--radius-md': '6px',
  '--radius-lg': '8px',
  '--radius-xl': '12px',
  '--radius-2xl': '16px',
  fontSize: '16px',
}

/** Panels: opaque enough to read on the brightest namecard, the art still showing through. */
const PANEL = 'rounded-xl border border-border-default bg-surface-raised/80 backdrop-blur-md'

const c = computed(() => props.character)
const banner = computed(() => characterBanner(c.value.key))
const glow = computed(() =>
  c.value.element ? ELEMENT_GLOW[c.value.element] : 'from-border-strong/40',
)
const glyphs = computed(() => talentIcons(c.value.key))
const weapon = computed(() => (c.value.weapon ? weaponLines(c.value.weapon) : null))
const CRIT = new Set(['critRate_', 'critDMG_'])

const DAMAGE_TEXT: Record<DamageKind, string> = { ...ELEMENT_TEXT, physical: 'text-physical' }

function statTitle(row: StatRow): string {
  const lines = [`${row.label} ${row.text}`]
  if (row.base !== undefined && row.bonus !== undefined) {
    lines.push(`${formatPanelValue(row.key, row.base)} + ${formatPanelValue(row.key, row.bonus)}`)
  }
  if (row.damage && props.panel && props.panel.allDmg > 0) {
    lines.push(`+${props.panel.allDmg.toFixed(1)}% all DMG, not on the game's panel`)
  }
  return lines.join('\n')
}

function setTitle(set: SetCount): string {
  return [`${set.name} ×${set.count}`, ...setBonusTitle(set.setKey, set.active)].join('\n')
}

/** Four substat lines per piece, empty ones kept, so the rows line up across the five. */
const pieces = computed(() =>
  SLOT_ORDER.map((slot, index) => {
    const piece = c.value.artifacts[index] ?? null
    if (!piece) return { slot, piece, lines: [], title: SLOT_LABELS[slot] }
    const rolls = inferArtifactRolls(piece)
    const lines: {
      key: string
      value: number
      rolls: readonly InferredRoll[]
      inactive: boolean
    }[] = [
      ...piece.substats.map((s, i) => ({ ...s, rolls: rolls[i] ?? [], inactive: false })),
      ...(piece.unactivatedSubstats ?? []).map((s) => ({ ...s, rolls: [], inactive: true })),
    ].slice(0, 4)
    const count =
      piece.totalRolls && piece.totalRolls > 0
        ? piece.totalRolls
        : rolls.reduce((sum, r) => sum + r.length, 0)
    const title = [
      itemName(piece.setKey),
      `${SLOT_LABELS[slot]} +${piece.level} · ${piece.rarity}★`,
      `CV ${piece.cv.toFixed(1)} · RV ${piece.rv}% · ${count} rolls`,
    ]
      .filter(Boolean)
      .join('\n')
    return { slot, piece, lines, title }
  }),
)

function rollTitle(key: string, rolls: readonly InferredRoll[]): string {
  return rolls
    .map((r) => `${formatRollValue(key, r.value)} (${ROLL_QUALITY_LABEL[r.quality]})`)
    .join(' + ')
}

const ownerLine = computed(() =>
  [
    props.owner.name,
    props.owner.uid ? `UID ${props.owner.uid}` : null,
    props.owner.ar ? `AR ${props.owner.ar}` : null,
  ].filter(Boolean),
)
const shadow = '[text-shadow:0_1px_8px_var(--surface-base)]'
</script>

<template>
  <div
    :data-theme="theme"
    class="relative h-[720px] w-[1280px] overflow-hidden bg-surface-base font-sans text-text-primary"
    :style="PIXELS"
  >
    <!-- The namecard in its own colours, a light scrim (stronger behind the splash) and the element's tint -->
    <img
      v-if="banner"
      :src="banner"
      alt=""
      class="pointer-events-none absolute inset-0 size-full object-cover"
    />
    <div
      class="absolute inset-0 bg-linear-to-r from-surface-base/60 via-surface-base/25 via-45% to-surface-base/30"
    />
    <div
      class="absolute inset-0 bg-linear-to-br via-transparent via-50% to-transparent"
      :class="glow"
    />
    <SplashArt
      :character-key="c.key"
      :name="c.name"
      :rarity="c.rarity"
      eager
      class="absolute top-0 left-0 h-full w-[600px] [mask-image:linear-gradient(to_right,black_70%,transparent)]"
      img-class="scale-[1.14] object-[50%_28%]"
    />
    <!-- Light scrims under the name (top) and the talents and owner (bottom) -->
    <div
      class="absolute top-0 left-0 h-44 w-[560px] bg-linear-to-b from-surface-base/70 to-transparent"
    />
    <div
      class="absolute bottom-0 left-0 h-48 w-[560px] bg-linear-to-t from-surface-base/75 to-transparent"
    />

    <!-- Left: who; constellations down the splash's edge; talents -->
    <div class="absolute top-6 left-8 flex max-w-[420px] flex-col gap-1.5" :class="shadow">
      <p class="flex items-center gap-3">
        <ElementIcon v-if="c.element" :element="c.element" class="size-8!" />
        <span class="truncate font-display text-[46px] leading-tight font-semibold">{{
          c.name
        }}</span>
      </p>
      <p class="flex items-center gap-5 text-xl">
        <LevelText :level="c.level" :ascension="c.ascension" class="font-medium" />
        <span v-if="c.friendship !== null" class="text-text-secondary"
          >Friendship
          <span class="tabular font-mono text-text-primary">{{ c.friendship }}</span></span
        >
      </p>
      <RarityStars v-if="c.rarity" :rarity="c.rarity" class="[&_svg]:size-5" />
    </div>
    <ConstellationIcons
      :character-key="c.key"
      :value="c.constellation"
      :element="c.element"
      size="xl"
      class="absolute top-[150px] bottom-[150px] left-[452px] justify-between"
    />
    <ul class="absolute bottom-[52px] left-8 flex gap-6" aria-label="Talents">
      <li
        v-for="t in talents"
        :key="t.key"
        class="flex flex-col items-center gap-1.5"
        :title="talentTitle(t)"
      >
        <ElementDisc :src="glyphs[t.key]" :element="c.element" size="xl" />
        <span
          class="tabular flex items-center gap-1 rounded-full bg-surface-raised/85 px-2.5 font-mono text-xl leading-snug font-semibold"
          :class="t.from ? 'text-accent-text' : t.crowned ? 'text-rarity-5' : ''"
        >
          {{ t.level }}
          <Crown v-if="t.crowned" class="size-4 text-rarity-5" aria-hidden="true" />
        </span>
      </li>
    </ul>

    <!-- Middle: weapon, stats (they take the height left), sets and the build's CV -->
    <div class="absolute top-6 bottom-[52px] left-[552px] flex w-[316px] flex-col gap-3">
      <section v-if="c.weapon" class="flex shrink-0 items-center gap-3.5 p-3.5" :class="PANEL">
        <span
          class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg"
          :class="c.weapon.rarity ? RARITY_SOFT[c.weapon.rarity] : 'bg-surface-overlay'"
        >
          <img
            v-if="weaponIcon(c.weapon.key, c.weapon.ascension)"
            :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
            alt=""
            class="size-full object-contain"
          />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <p class="truncate text-xl leading-tight font-semibold" :title="c.weapon.name">
            {{ c.weapon.name }}
          </p>
          <p class="flex items-center gap-3 text-base">
            <LevelText :level="c.weapon.level" :ascension="c.weapon.ascension" />
            <span
              class="tabular font-mono font-semibold text-accent-text"
              :title="`Refinement ${c.weapon.refinement} of 5`"
              >R{{ c.weapon.refinement }}</span
            >
            <RarityStars v-if="c.weapon.rarity" :rarity="c.weapon.rarity" />
          </p>
          <p v-if="weapon" class="flex flex-wrap items-baseline gap-x-3 text-base">
            <span
              v-for="stat in [weapon.atk, weapon.sub].filter((s) => s !== null)"
              :key="stat.key"
              class="flex items-baseline gap-1 whitespace-nowrap"
            >
              <span class="text-text-secondary">{{
                stat.key === 'baseAtk' ? 'ATK' : formatStatShort(stat.key)
              }}</span>
              <span class="tabular font-mono font-semibold">{{ stat.text }}</span>
            </span>
          </p>
          <p
            v-if="weapon?.passive.length"
            class="truncate text-sm text-text-secondary"
            :title="weapon.passive.map((s) => `${s.label} +${s.text}`).join(', ')"
          >
            {{ weapon.passive.map((s) => `${formatStatShort(s.key)} +${s.text}`).join(' · ') }}
          </p>
        </div>
      </section>
      <section
        v-else
        class="flex h-[108px] shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-raised/60 text-lg text-text-muted"
      >
        No weapon
      </section>

      <section class="flex min-h-0 flex-1 flex-col px-4 py-1" :class="PANEL">
        <dl v-if="panel" class="flex flex-1 flex-col divide-y divide-border-subtle">
          <div
            v-for="row in panel.rows"
            :key="row.key"
            class="flex flex-1 items-center justify-between gap-2"
            :title="statTitle(row)"
          >
            <dt
              class="flex min-w-0 items-center gap-1.5 truncate text-[17px]"
              :class="
                row.damage
                  ? DAMAGE_TEXT[row.damage]
                  : CRIT.has(row.key)
                    ? 'text-text-primary'
                    : 'text-text-secondary'
              "
            >
              <ElementIcon
                v-if="row.damage && row.damage !== 'physical'"
                :element="row.damage"
                size="sm"
                decorative
              />
              {{ row.label }}
            </dt>
            <dd class="tabular flex items-baseline gap-2 font-mono">
              <span v-if="row.base !== undefined && row.bonus" class="text-sm text-text-muted"
                >{{ formatPanelValue(row.key, row.base) }}
                <span class="text-success-text"
                  >+{{ formatPanelValue(row.key, row.bonus) }}</span
                ></span
              >
              <span
                class="text-lg font-semibold"
                :class="row.damage ? DAMAGE_TEXT[row.damage] : ''"
                >{{ row.text }}</span
              >
            </dd>
          </div>
        </dl>
        <p v-else class="m-auto text-lg text-text-muted" title="Newer than the game data">
          No stats
        </p>
      </section>

      <section class="flex shrink-0 flex-col gap-2 px-3.5 py-2.5" :class="PANEL">
        <p
          v-for="set in c.sets.slice(0, 3)"
          :key="set.setKey"
          class="flex items-center gap-2.5"
          :title="setTitle(set)"
        >
          <img
            v-if="artifactSetIcon(set.setKey)"
            :src="artifactSetIcon(set.setKey)"
            alt=""
            class="size-8 shrink-0"
          />
          <span class="min-w-0 flex-1 truncate text-base">{{ set.name }}</span>
          <span
            class="tabular rounded-md px-2 font-mono text-base font-semibold"
            :class="
              set.active.length
                ? 'bg-success-text/15 text-success-text'
                : 'bg-surface-overlay text-text-secondary'
            "
            >{{ set.count }}</span
          >
        </p>
        <p v-if="!c.sets.length" class="py-1 text-base text-text-muted">No artifacts</p>
        <p
          v-if="c.artifactCount"
          class="flex items-baseline justify-end border-t border-border-subtle pt-2"
        >
          <CritValue :value="c.cv" scope="build" label class="text-xl font-semibold" />
        </p>
      </section>
    </div>

    <!-- Right: the five pieces, filling the column; icon + main stat + CV | four substats -->
    <ol
      class="absolute top-6 right-6 bottom-[52px] flex w-[376px] flex-col gap-2.5"
      aria-label="Artifacts"
    >
      <li v-for="{ slot, piece, lines, title } in pieces" :key="slot" class="flex min-h-0 flex-1">
        <article
          v-if="piece"
          class="flex flex-1 items-stretch gap-3 p-3"
          :class="PANEL"
          :title="title"
        >
          <div class="flex w-[150px] shrink-0 items-center gap-2.5">
            <span
              class="relative flex size-16 shrink-0 items-center justify-center rounded-lg"
              :class="RARITY_SOFT[piece.rarity] ?? 'bg-surface-overlay'"
            >
              <img
                v-if="artifactIcon(piece.setKey, piece.slotKey)"
                :src="artifactIcon(piece.setKey, piece.slotKey)"
                alt=""
                class="size-full object-contain"
              />
              <span
                class="tabular absolute -right-1.5 -bottom-1.5 rounded-md bg-surface-raised px-1 font-mono text-xs font-semibold shadow-sm"
                :class="piece.maxed ? 'text-text-secondary' : 'text-warning-text'"
                >+{{ piece.level }}</span
              >
            </span>
            <div class="flex min-w-0 flex-col">
              <span class="truncate text-sm text-text-secondary">{{
                formatStatShort(piece.mainStatKey)
              }}</span>
              <span class="tabular font-mono text-2xl leading-tight font-semibold">{{
                piece.mainStatValue === null
                  ? '—'
                  : formatStatValue(piece.mainStatKey, piece.mainStatValue)
              }}</span>
              <CritValue
                :value="piece.cv"
                :crit-circlet="isCritCirclet(piece.slotKey, piece.mainStatKey)"
                :plain="piece.rarity < 5"
                label
                class="text-sm"
              />
            </div>
          </div>
          <div
            class="flex min-w-0 flex-1 flex-col justify-between border-l border-border-subtle py-0.5 pl-3"
          >
            <p
              v-for="n in 4"
              :key="n"
              class="flex h-[22px] items-center gap-2 text-[15px]"
              :class="lines[n - 1]?.inactive ? 'text-text-muted' : ''"
              :title="
                lines[n - 1] && !lines[n - 1]!.inactive
                  ? rollTitle(lines[n - 1]!.key, lines[n - 1]!.rolls)
                  : lines[n - 1]
                    ? 'Activates at +4'
                    : undefined
              "
            >
              <template v-if="lines[n - 1]">
                <span
                  class="min-w-0 flex-1 truncate"
                  :class="lines[n - 1]!.inactive ? '' : 'text-text-secondary'"
                  >{{ formatStatShort(lines[n - 1]!.key) }}</span
                >
                <span class="tabular font-mono font-medium">{{
                  formatStatValue(lines[n - 1]!.key, lines[n - 1]!.value)
                }}</span>
                <RollBars v-if="!lines[n - 1]!.inactive" :rolls="lines[n - 1]!.rolls" size="sm" />
                <span v-else class="w-8 shrink-0" />
              </template>
            </p>
          </div>
        </article>
        <div
          v-else
          class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-raised/50 text-lg text-text-muted"
        >
          {{ SLOT_LABELS[slot] }}
        </div>
      </li>
    </ol>

    <!-- Foot: owner, capture date, site -->
    <p
      class="absolute right-6 bottom-4 left-8 flex items-baseline justify-between gap-4 text-base text-text-secondary"
    >
      <span class="truncate font-medium" :class="shadow">{{ ownerLine.join(' · ') }}</span>
      <span
        class="shrink-0 rounded-md bg-surface-raised/70 px-2 text-sm whitespace-nowrap text-text-secondary"
        ><template v-if="takenAt">{{ formatDate(takenAt) }} · </template
        >genshin-tracker.475.dev</span
      >
    </p>
  </div>
</template>
