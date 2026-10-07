<script setup lang="ts">
import { computed } from 'vue'
import CritValue from '@/components/ui/CritValue.vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
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
import { levelCap } from '@/lib/level'
import { ROLL_QUALITY_LABEL, inferArtifactRolls, type InferredRoll } from '@/utils/artifact-rolls'
import { formatRollValue, formatStatShort, formatStatValue } from '@/utils/artifact-stats'
import CardRollBars from './CardRollBars.vue'
import ConstellationIcons from './ConstellationIcons.vue'
import ElementDisc from './ElementDisc.vue'
import GameStars from './GameStars.vue'
import SplashArt from './SplashArt.vue'
import type { CardOwner } from './share-card'
import { talentIcons } from './talent-icons'
import { ELEMENT_GLOW, ELEMENT_TEXT, RARITY_SOFT } from './tokens'
import { useCrownIcon } from './use-boosts'

/**
 * The build as one card on a fixed 1280×720 canvas, Enka-style: splash art
 * with the constellations and talents on the left; weapon, the in-game
 * stats and the sets in the middle; the five pieces on the right; the
 * owner and the site under the talents; the namecard behind it all. The
 * wide character details show it as is (scaled), and the PNG export draws
 * it at 1.5× (1920×1080, lib/share-image).
 *
 * One composition: the namecard full-bleed, the splash fading into it
 * (a gradient mask that reaches nothing before its box ends), and soft
 * gradients for legibility, none with an edge. Panels get their contrast
 * from their own fill.
 *
 * It has its own theme (`data-theme`) whatever the page's, and pins
 * Tailwind's rem-based spacing, type and radii to pixels, so the image
 * doesn't follow the page's root font size. No viewport breakpoints, no
 * backdrop filters and no CSS masks with images, so the export draws what
 * the page shows. Details are in tooltips, as elsewhere.
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
const PANEL = 'rounded-xl border border-border-default bg-surface-raised/85'

/** Text on the art: a tight halo in the card's ground colour, then a soft one. */
const ON_ART = '[text-shadow:0_1px_2px_var(--surface-base),0_0_14px_var(--surface-base)]'

const c = computed(() => props.character)
const banner = computed(() => characterBanner(c.value.key))
const glow = computed(() =>
  c.value.element ? ELEMENT_GLOW[c.value.element] : 'from-border-strong/40',
)
const glyphs = computed(() => talentIcons(c.value.key))
const crown = useCrownIcon()
const weapon = computed(() => (c.value.weapon ? weaponLines(c.value.weapon) : null))
const cap = computed(() => levelCap(c.value.ascension, c.value.level))
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
    if (!piece) return { slot, piece, lines: [], rollCount: 0, title: SLOT_LABELS[slot] }
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
    const rollCount =
      piece.totalRolls && piece.totalRolls > 0
        ? piece.totalRolls
        : rolls.reduce((sum, r) => sum + r.length, 0)
    const title = [
      itemName(piece.setKey),
      `${SLOT_LABELS[slot]} +${piece.level} · ${piece.rarity}★`,
      `CV ${piece.cv.toFixed(1)} · RV ${piece.rv}% · ${rollCount} rolls (the first ones and one per +4)`,
    ].join('\n')
    return { slot, piece, lines, rollCount, title }
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
</script>

<template>
  <div
    :data-theme="theme"
    class="relative h-[720px] w-[1280px] overflow-hidden bg-surface-base font-sans text-text-primary"
    :style="PIXELS"
  >
    <!-- The namecard full-bleed in its own colours, a soft scrim and the element's tint -->
    <img
      v-if="banner"
      :src="banner"
      alt=""
      class="pointer-events-none absolute inset-0 size-full object-cover"
    />
    <div
      class="absolute inset-0 bg-linear-to-r from-surface-base/55 via-surface-base/20 via-40% to-surface-base/25"
    />
    <div
      class="absolute inset-0 bg-linear-to-br via-transparent via-50% to-transparent"
      :class="glow"
    />
    <!-- The splash fades out well inside its box: no seam where the box ends -->
    <SplashArt
      :character-key="c.key"
      :name="c.name"
      :rarity="c.rarity"
      eager
      class="absolute top-0 left-0 h-full w-[660px] [mask-image:linear-gradient(to_right,black_52%,transparent_96%)]"
      img-class="scale-[1.12] object-[44%_28%]"
    />
    <!-- Soft glows behind the name (top left) and the talents and owner (bottom left) -->
    <div
      class="absolute inset-0 [background:radial-gradient(ellipse_48%_34%_at_0%_0%,color-mix(in_srgb,var(--surface-base)_80%,transparent),transparent)]"
    />
    <div
      class="absolute inset-0 [background:radial-gradient(ellipse_46%_40%_at_0%_100%,color-mix(in_srgb,var(--surface-base)_85%,transparent),transparent)]"
    />

    <!-- Left: who; constellations down the splash's edge; talents; owner -->
    <div class="absolute top-4 left-7 flex max-w-[400px] flex-col gap-1">
      <p class="flex items-center gap-3" :class="ON_ART">
        <ElementIcon v-if="c.element" :element="c.element" class="size-9!" />
        <span class="truncate font-display text-[48px] leading-tight font-semibold">{{
          c.name
        }}</span>
      </p>
      <p class="tabular flex items-baseline gap-5 font-mono text-[22px]" :class="ON_ART">
        <span
          :title="`Level ${c.level} of ${cap} · Ascension ${c.ascension}`"
          class="whitespace-nowrap"
          ><span class="font-medium text-text-primary/80">Lv. </span
          ><span class="font-bold">{{ c.level }}</span
          ><span class="font-medium text-text-primary/70">/{{ cap }}</span></span
        >
        <span v-if="c.friendship !== null" class="whitespace-nowrap"
          ><span class="font-medium text-text-primary/80">Friendship </span
          ><span class="font-bold">{{ c.friendship }}</span></span
        >
      </p>
      <GameStars v-if="c.rarity" :rarity="c.rarity" size="lg" class="mt-0.5" />
    </div>
    <ConstellationIcons
      :character-key="c.key"
      :value="c.constellation"
      :element="c.element"
      size="xl"
      class="absolute top-[96px] bottom-[96px] left-[428px] justify-between"
    />
    <ul class="absolute bottom-[78px] left-7 flex gap-6" aria-label="Talents">
      <li
        v-for="t in talents"
        :key="t.key"
        class="flex flex-col items-center gap-1.5"
        :title="talentTitle(t)"
      >
        <ElementDisc :src="glyphs[t.key]" :element="c.element" size="xl" />
        <span
          class="tabular flex h-8 items-center gap-1 rounded-full bg-surface-raised/90 px-2.5 font-mono text-[22px] font-bold shadow-sm"
          :class="t.from ? 'text-accent-text' : t.crowned ? 'text-rarity-5' : ''"
        >
          {{ t.level }}
          <img v-if="t.crowned && crown" :src="crown" alt="" class="-mr-1 size-7" />
        </span>
      </li>
    </ul>
    <div class="absolute bottom-4 left-7 flex max-w-[470px] flex-col" :class="ON_ART">
      <p v-if="ownerLine.length" class="truncate text-lg font-semibold">
        {{ ownerLine.join(' · ') }}
      </p>
      <p class="text-sm font-medium whitespace-nowrap text-text-primary/80">
        <template v-if="takenAt">{{ formatDate(takenAt) }} · </template>genshin-tracker.475.dev
      </p>
    </div>

    <!-- Middle: weapon, stats (they take the height left), sets and the build's CV -->
    <div class="absolute top-5 bottom-5 left-[508px] flex w-[312px] flex-col gap-3">
      <section v-if="c.weapon" class="flex shrink-0 items-center gap-3.5 p-3.5" :class="PANEL">
        <span
          class="flex size-[84px] shrink-0 items-center justify-center overflow-hidden rounded-lg"
          :class="c.weapon.rarity ? RARITY_SOFT[c.weapon.rarity] : 'bg-surface-overlay'"
        >
          <img
            v-if="weaponIcon(c.weapon.key, c.weapon.ascension)"
            :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
            alt=""
            class="size-full object-contain"
          />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <p class="truncate text-[21px] leading-tight font-semibold" :title="c.weapon.name">
            {{ c.weapon.name }}
          </p>
          <p class="flex items-center gap-3 text-[17px]">
            <LevelText :level="c.weapon.level" :ascension="c.weapon.ascension" />
            <span
              class="tabular font-mono font-bold text-accent-text"
              :title="`Refinement ${c.weapon.refinement} of 5`"
              >R{{ c.weapon.refinement }}</span
            >
          </p>
          <GameStars v-if="c.weapon.rarity" :rarity="c.weapon.rarity" />
          <p v-if="weapon" class="flex flex-wrap items-baseline gap-x-3 text-[17px]">
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
        class="flex h-[112px] shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-raised/60 text-xl text-text-muted"
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
              class="flex min-w-0 items-center gap-1.5 truncate text-xl"
              :class="
                row.damage
                  ? DAMAGE_TEXT[row.damage]
                  : CRIT.has(row.key)
                    ? 'font-medium text-text-primary'
                    : 'text-text-secondary'
              "
            >
              <ElementIcon
                v-if="row.damage && row.damage !== 'physical'"
                :element="row.damage"
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
                class="text-[23px] font-semibold"
                :class="row.damage ? DAMAGE_TEXT[row.damage] : ''"
                >{{ row.text }}</span
              >
            </dd>
          </div>
        </dl>
        <p v-else class="m-auto text-xl text-text-muted" title="Newer than the game data">
          No stats
        </p>
      </section>

      <section class="flex shrink-0 flex-col gap-2 px-3.5 py-3" :class="PANEL">
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
            class="size-9 shrink-0"
          />
          <span class="min-w-0 flex-1 truncate text-[17px]">{{ set.name }}</span>
          <span
            class="tabular rounded-md px-2 font-mono text-lg font-bold"
            :class="
              set.active.length
                ? 'bg-success-text/15 text-success-text'
                : 'bg-surface-overlay text-text-secondary'
            "
            >{{ set.count }}</span
          >
        </p>
        <p v-if="!c.sets.length" class="py-1 text-lg text-text-muted">No artifacts</p>
        <p
          v-if="c.artifactCount"
          class="flex items-baseline justify-end border-t border-border-subtle pt-2"
        >
          <CritValue :value="c.cv" scope="build" label class="text-2xl font-semibold" />
        </p>
      </section>
    </div>

    <!-- Right: the five pieces, filling the column; icon + main stat + CV + rolls | four substats -->
    <ol
      class="absolute top-5 right-5 bottom-5 flex w-[428px] flex-col gap-2.5"
      aria-label="Artifacts"
    >
      <li
        v-for="{ slot, piece, lines, rollCount, title } in pieces"
        :key="slot"
        class="flex min-h-0 flex-1"
      >
        <article
          v-if="piece"
          class="flex flex-1 items-center gap-3 px-3 py-2.5"
          :class="PANEL"
          :title="title"
        >
          <div class="flex w-[176px] shrink-0 items-center gap-2.5">
            <span
              class="relative flex size-[84px] shrink-0 items-center justify-center rounded-lg"
              :class="RARITY_SOFT[piece.rarity] ?? 'bg-surface-overlay'"
            >
              <img
                v-if="artifactIcon(piece.setKey, piece.slotKey)"
                :src="artifactIcon(piece.setKey, piece.slotKey)"
                alt=""
                class="size-full object-contain"
              />
              <span
                class="tabular absolute -right-1.5 -bottom-1.5 rounded-md bg-surface-raised px-1 font-mono text-[13px] font-bold shadow-sm"
                :class="piece.maxed ? 'text-text-secondary' : 'text-warning-text'"
                >+{{ piece.level }}</span
              >
            </span>
            <div class="flex min-w-0 flex-col">
              <span class="text-sm whitespace-nowrap text-text-secondary">{{
                formatStatShort(piece.mainStatKey)
              }}</span>
              <span class="tabular font-mono text-[26px] leading-tight font-bold">{{
                piece.mainStatValue === null
                  ? '—'
                  : formatStatValue(piece.mainStatKey, piece.mainStatValue)
              }}</span>
              <CritValue
                :value="piece.cv"
                :crit-circlet="isCritCirclet(piece.slotKey, piece.mainStatKey)"
                :plain="piece.rarity < 5"
                label
                class="text-sm font-medium"
              />
              <span class="text-[13px] whitespace-nowrap text-text-muted"
                ><span class="tabular font-mono text-text-secondary">{{ rollCount }}</span>
                rolls</span
              >
            </div>
          </div>
          <div
            class="flex min-w-0 flex-1 flex-col justify-between self-stretch border-l border-border-subtle py-0.5 pl-3"
          >
            <p
              v-for="n in 4"
              :key="n"
              class="flex h-[23px] items-center gap-2 text-base"
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
                <span class="tabular font-mono font-semibold">{{
                  formatStatValue(lines[n - 1]!.key, lines[n - 1]!.value)
                }}</span>
                <CardRollBars :rolls="lines[n - 1]!.inactive ? [] : lines[n - 1]!.rolls" />
              </template>
            </p>
          </div>
        </article>
        <div
          v-else
          class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-raised/60 text-xl text-text-muted"
        >
          {{ SLOT_LABELS[slot] }}
        </div>
      </li>
    </ol>
  </div>
</template>
