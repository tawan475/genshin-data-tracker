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
  weaponLines,
  type BuildPanel,
  type TalentLevel,
} from '@/data/character-build'
import { SLOT_LABELS, SLOT_ORDER, type CharacterView } from '@/data/characters'
import { artifactIcon, artifactSetIcon, characterBanner, weaponIcon } from '@/lib/assets'
import { isCritCirclet } from '@/lib/crit-tiers'
import { formatDate } from '@/lib/format'
import { inferArtifactRolls } from '@/utils/artifact-rolls'
import { formatStatShort, formatStatValue } from '@/utils/artifact-stats'
import ConstellationIcons from './ConstellationIcons.vue'
import SplashArt from './SplashArt.vue'
import { talentIcons } from './talent-icons'
import { ELEMENT_FILL, ELEMENT_GLOW, RARITY_SOFT } from './tokens'

/**
 * The share card: one build on a fixed 1280×720 canvas (exported at 1.5×,
 * 1920×1080), Enka-style. Splash art with the constellations and talents
 * on the left, weapon, in-game stats and sets in the middle, the five
 * pieces on the right, the owner and the site at the foot. Its own theme
 * (`data-theme`), whatever the page's; spacing, type and radii are pinned
 * to pixels here so the image doesn't follow the page's root font size.
 * No viewport breakpoints and no CSS masks with images, so the PNG export
 * (lib/share-image) draws what the preview shows.
 */
const props = defineProps<{
  character: CharacterView
  panel: BuildPanel | null
  talents: TalentLevel[]
  theme: 'light' | 'dark'
  /** What the owner chose to show; null parts are left out. */
  owner: { name: string | null; uid: string | null; ar: number | null }
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
  '--radius-sm': '4px',
  '--radius-md': '6px',
  '--radius-lg': '8px',
  '--radius-xl': '12px',
  '--radius-2xl': '16px',
  fontSize: '16px',
}

const c = computed(() => props.character)
const glow = computed(() =>
  c.value.element ? ELEMENT_GLOW[c.value.element] : 'from-border-strong',
)
const fill = computed(() => (c.value.element ? ELEMENT_FILL[c.value.element] : 'bg-text-secondary'))
const glyphs = computed(() => talentIcons(c.value.key))
const weapon = computed(() => (c.value.weapon ? weaponLines(c.value.weapon) : null))
const CRIT = new Set(['critRate_', 'critDMG_'])

const pieces = computed(() =>
  SLOT_ORDER.map((slot, index) => {
    const piece = c.value.artifacts[index] ?? null
    return { slot, piece, rolls: piece ? inferArtifactRolls(piece) : [] }
  }),
)
const ownerLine = computed(() =>
  [
    props.owner.name,
    props.owner.uid ? `UID ${props.owner.uid}` : null,
    props.owner.ar ? `AR ${props.owner.ar}` : null,
  ].filter(Boolean),
)
const shadow = '[text-shadow:0_1px_10px_var(--surface-base)]'
</script>

<template>
  <div
    :data-theme="theme"
    class="relative h-[720px] w-[1280px] overflow-hidden bg-surface-base font-sans text-text-primary"
    :style="PIXELS"
  >
    <div
      class="absolute inset-0 bg-linear-to-r via-transparent via-45% to-transparent"
      :class="glow"
    />
    <img
      v-if="characterBanner(c.key)"
      :src="characterBanner(c.key)"
      alt=""
      class="absolute top-0 right-0 h-full w-[900px] object-cover opacity-[0.12] [mask-image:linear-gradient(to_left,black_30%,transparent)]"
    />
    <SplashArt
      :character-key="c.key"
      :name="c.name"
      :rarity="c.rarity"
      eager
      class="absolute top-0 left-0 h-full w-[580px] [mask-image:linear-gradient(to_right,black_72%,transparent)]"
      img-class="scale-[1.12] object-[50%_30%]"
    />
    <!-- Scrims under the name (top) and the talents and owner (bottom) -->
    <div
      class="absolute top-0 left-0 h-48 w-[600px] bg-linear-to-b from-surface-base/85 via-surface-base/40 to-transparent"
    />
    <div
      class="absolute bottom-0 left-0 h-52 w-[600px] bg-linear-to-t from-surface-base/90 via-surface-base/45 to-transparent"
    />

    <!-- Left: who, constellations, talents -->
    <div class="absolute top-6 left-8 flex max-w-[400px] flex-col gap-1.5" :class="shadow">
      <p class="flex items-center gap-2.5">
        <ElementIcon v-if="c.element" :element="c.element" size="lg" class="size-7!" />
        <span class="truncate font-display text-4xl leading-tight font-semibold">{{ c.name }}</span>
      </p>
      <p class="flex items-center gap-4 text-lg">
        <LevelText :level="c.level" :ascension="c.ascension" class="font-medium" />
        <span v-if="c.friendship !== null" class="text-text-secondary"
          >Friendship
          <span class="tabular font-mono text-text-primary">{{ c.friendship }}</span></span
        >
      </p>
      <RarityStars v-if="c.rarity" :rarity="c.rarity" />
    </div>
    <ConstellationIcons
      :character-key="c.key"
      :value="c.constellation"
      :element="c.element"
      size="lg"
      class="absolute top-1/2 left-[476px] -translate-y-1/2"
    />
    <ul class="absolute bottom-14 left-8 flex gap-4" aria-label="Talents">
      <li v-for="t in talents" :key="t.key" class="flex flex-col items-center gap-1">
        <span class="flex size-14 items-center justify-center rounded-full shadow-sm" :class="fill">
          <img v-if="glyphs[t.key]" :src="glyphs[t.key]" alt="" class="size-10" />
        </span>
        <span
          class="tabular flex items-center gap-1 rounded-full bg-surface-raised/90 px-2 font-mono text-lg leading-snug font-semibold"
          :class="t.from ? 'text-accent-text' : t.crowned ? 'text-rarity-5' : ''"
        >
          {{ t.level }}
          <Crown v-if="t.crowned" class="size-4 text-rarity-5" aria-hidden="true" />
        </span>
      </li>
    </ul>

    <!-- Middle: weapon, stats, sets -->
    <div class="absolute top-6 bottom-[74px] left-[548px] flex w-[332px] flex-col gap-3">
      <section
        v-if="c.weapon"
        class="flex items-center gap-3 rounded-xl border border-border-default bg-surface-raised/85 p-3"
      >
        <span
          class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg"
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
          <p class="truncate text-lg leading-tight font-semibold">{{ c.weapon.name }}</p>
          <p class="flex items-center gap-3 text-sm">
            <LevelText :level="c.weapon.level" :ascension="c.weapon.ascension" />
            <span class="tabular font-mono font-medium text-accent-text"
              >R{{ c.weapon.refinement }}</span
            >
            <RarityStars v-if="c.weapon.rarity" :rarity="c.weapon.rarity" />
          </p>
          <p v-if="weapon" class="flex items-baseline gap-3 text-sm">
            <span
              v-for="stat in [weapon.atk, weapon.sub].filter((s) => s !== null)"
              :key="stat.key"
              class="flex items-baseline gap-1 whitespace-nowrap"
            >
              <span class="text-text-secondary">{{
                stat.key === 'baseAtk' ? 'ATK' : stat.label
              }}</span>
              <span class="tabular font-mono font-semibold">{{ stat.text }}</span>
            </span>
          </p>
        </div>
      </section>
      <section
        v-else
        class="flex h-[90px] items-center justify-center rounded-xl border border-dashed border-border-strong text-text-muted"
      >
        No weapon
      </section>

      <section class="rounded-xl border border-border-default bg-surface-raised/85 px-4 py-1">
        <dl v-if="panel" class="flex flex-col divide-y divide-border-subtle">
          <div
            v-for="row in panel.rows"
            :key="row.key"
            class="flex h-[33px] items-center justify-between gap-2"
          >
            <dt
              class="flex min-w-0 items-center gap-1.5 truncate text-[15px]"
              :class="CRIT.has(row.key) ? 'text-text-primary' : 'text-text-secondary'"
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
              <span v-if="row.base !== undefined && row.bonus" class="text-xs text-text-muted"
                >{{ formatPanelValue(row.key, row.base) }}
                <span class="text-success-text"
                  >+{{ formatPanelValue(row.key, row.bonus) }}</span
                ></span
              >
              <span class="text-base font-semibold">{{ row.text }}</span>
            </dd>
          </div>
        </dl>
        <p v-else class="py-8 text-center text-text-muted">No stats</p>
      </section>

      <section
        class="mt-auto flex flex-col gap-1.5 rounded-xl border border-border-default bg-surface-raised/85 px-3 py-2"
      >
        <p v-for="set in c.sets.slice(0, 3)" :key="set.setKey" class="flex items-center gap-2">
          <img
            v-if="artifactSetIcon(set.setKey)"
            :src="artifactSetIcon(set.setKey)"
            alt=""
            class="size-7 shrink-0"
          />
          <span class="min-w-0 flex-1 truncate text-sm">{{ set.name }}</span>
          <span
            class="tabular rounded px-1.5 font-mono text-sm font-semibold"
            :class="
              set.active.length
                ? 'bg-success-text/15 text-success-text'
                : 'bg-surface-overlay text-text-secondary'
            "
            >{{ set.count }}</span
          >
        </p>
        <p v-if="!c.sets.length" class="text-sm text-text-muted">No artifacts</p>
        <p
          v-if="c.artifactCount"
          class="flex items-baseline justify-end border-t border-border-subtle pt-1.5"
        >
          <CritValue :value="c.cv" scope="build" label class="text-lg font-semibold" />
        </p>
      </section>
    </div>

    <!-- Right: the five pieces -->
    <ol class="absolute top-6 right-6 flex w-[372px] flex-col gap-2" aria-label="Artifacts">
      <li v-for="{ slot, piece, rolls } in pieces" :key="slot" class="h-[118px]">
        <article
          v-if="piece"
          class="flex h-full gap-3 rounded-xl border border-border-default bg-surface-raised/85 p-2.5"
        >
          <div class="flex w-[118px] shrink-0 flex-col">
            <span
              class="relative flex size-14 items-center justify-center rounded-lg"
              :class="RARITY_SOFT[piece.rarity] ?? 'bg-surface-overlay'"
            >
              <img
                v-if="artifactIcon(piece.setKey, piece.slotKey)"
                :src="artifactIcon(piece.setKey, piece.slotKey)"
                alt=""
                class="size-full object-contain"
              />
              <span
                class="tabular absolute -right-2 -bottom-1 rounded-md bg-surface-raised px-1 font-mono text-xs font-semibold shadow-sm"
                :class="piece.maxed ? 'text-text-secondary' : 'text-warning-text'"
                >+{{ piece.level }}</span
              >
            </span>
            <span class="mt-auto truncate text-xs text-text-secondary">{{
              formatStatShort(piece.mainStatKey)
            }}</span>
            <span class="tabular font-mono text-xl leading-tight font-semibold">{{
              piece.mainStatValue === null
                ? '—'
                : formatStatValue(piece.mainStatKey, piece.mainStatValue)
            }}</span>
          </div>
          <div class="flex min-w-0 flex-1 flex-col">
            <p
              v-for="(sub, index) in piece.substats"
              :key="sub.key"
              class="flex h-[21px] items-center gap-2 text-sm"
            >
              <span class="min-w-0 flex-1 truncate text-text-secondary">{{
                formatStatShort(sub.key)
              }}</span>
              <span class="tabular font-mono font-medium">{{
                formatStatValue(sub.key, sub.value)
              }}</span>
              <RollBars :rolls="rolls[index] ?? []" size="sm" />
            </p>
            <p
              v-for="sub in piece.unactivatedSubstats ?? []"
              :key="`inactive-${sub.key}`"
              class="flex h-[21px] items-center gap-2 text-sm text-text-muted"
            >
              <span class="min-w-0 flex-1 truncate">{{ formatStatShort(sub.key) }}</span>
              <span class="tabular font-mono">{{ formatStatValue(sub.key, sub.value) }}</span>
              <span class="w-8 shrink-0" />
            </p>
            <p class="mt-auto text-right text-sm">
              <CritValue
                :value="piece.cv"
                :crit-circlet="isCritCirclet(piece.slotKey, piece.mainStatKey)"
                :plain="piece.rarity < 5"
                label
              />
            </p>
          </div>
        </article>
        <div
          v-else
          class="flex h-full items-center justify-center rounded-xl border border-dashed border-border-strong text-text-muted"
        >
          {{ SLOT_LABELS[slot] }}
        </div>
      </li>
    </ol>

    <!-- Foot: owner, capture date, site -->
    <p
      class="absolute right-6 bottom-5 left-8 flex items-baseline justify-between gap-4 text-sm text-text-secondary"
    >
      <span class="truncate" :class="shadow">{{ ownerLine.join(' · ') }}</span>
      <span class="shrink-0 text-xs whitespace-nowrap text-text-muted"
        ><template v-if="takenAt">{{ formatDate(takenAt) }} · </template
        >genshin-tracker.475.dev</span
      >
    </p>
  </div>
</template>
