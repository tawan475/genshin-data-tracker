<script setup lang="ts">
import { computed, provide } from 'vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import {
  bonusSets,
  buildRv,
  formatPanelValue,
  setBonusTitle,
  talentTitle,
  weaponLines,
  type BuildPanel,
  type DamageKind,
  type StatRow,
  type TalentLevel,
} from '@/data/character-build'
import { SLOT_LABELS, SLOT_ORDER, type CharacterView, type SetCount } from '@/data/characters'
import { artifactIcon, artifactSetIcon, characterBanner, weaponIcon } from '@/lib/assets'
import { CRIT_TIER_TEXT, cvTier, isCritCirclet, rvTier } from '@/lib/crit-tiers'
import { formatDate } from '@/lib/format'
import { levelCap } from '@/lib/level'
import { ROLL_QUALITY_LABEL, inferArtifactRolls, type InferredRoll } from '@/utils/artifact-rolls'
import {
  formatRollValue,
  formatSetName,
  formatStatShort,
  formatStatValue,
} from '@/utils/artifact-stats'
import CardRollBars from './CardRollBars.vue'
import ElementDisc from './ElementDisc.vue'
import GameStars from './GameStars.vue'
import FadeImage from './FadeImage.vue'
import SplashArt from './SplashArt.vue'
import { CONSTELLATION_MAX_STYLE, isMaxConstellation, refinementStyle } from './max-badges'
import {
  BAND_CV_ON,
  BAND_EMBLEM,
  BAND_TIER_COLOR,
  CARD_HEIGHT,
  CARD_STILL,
  CARD_THEMES,
  CARD_WIDTH,
  EMBLEM_URL,
  RARITY_GRADIENT,
  SPLASH_LEFT,
  WEAPON_EMBLEM,
  elementGlow,
  emblemStyle,
  nameSize,
  qualityArt,
  type CardOwner,
} from './share-card'
import { constellationIcons, talentIcons } from './talent-icons'
import { ELEMENT_TEXT } from './tokens'
import { useCrownIcon } from './use-boosts'

/**
 * The build as one 1920×1080 card, after the "Character Showcase Card"
 * design: on the namecard, the splash art fading into it; name, level,
 * friendship and stars, the constellations down the left column's edge, the
 * talents with the owner and the capture date and site at its foot; weapon,
 * the in-game stats and the sets in the middle; the five pieces on the
 * right, both running to the bottom edge. The weapon's tile and each
 * piece's band (main stat, stars, CV and RV left of the icon) carry the
 * game's item header art: its rarity's gradient under the emblem
 * (share-card QUALITY_ART, EMBLEM; from gi-cdn), alike in both themes.
 * The wide character details show it scaled to their width, and the PNG is
 * this card at 1× (lib/share-image).
 *
 * Its own palette (share-card CARD_THEMES, light or dark whatever the
 * page's), sizes in px (not the page's rem), no viewport breakpoints and no
 * masks with images, so the export draws what the page shows. Details are
 * in tooltips, as elsewhere.
 */
const props = defineProps<{
  character: CharacterView
  panel: BuildPanel | null
  talents: TalentLevel[]
  theme: 'light' | 'dark'
  owner: CardOwner
  /** When the capture was taken (epoch ms). */
  takenAt: number | null
  /** Drawn for the PNG export: images show as soon as they load, no fade. */
  still?: boolean
}>()
provide(CARD_STILL, props.still)

/** Tailwind's rem-based spacing pinned to 4px, so stray utilities don't follow the page's root size. */
const ROOT = computed(() => ({
  ...CARD_THEMES[props.theme],
  '--spacing': '4px',
  fontSize: '16px',
  width: `${CARD_WIDTH}px`,
  height: `${CARD_HEIGHT}px`,
}))

/** The panels' glass, as the design: translucent fill, shadow and hairline, blur. */
const PANEL =
  'rounded-[22px] bg-(--card-panel) shadow-(--card-panel-shadow) backdrop-blur-[16px] backdrop-saturate-[1.2]'
/** Text on the art: the hero colour with its shadow (dark text with a white glow on light cards). */
const HERO = 'text-(--card-hero) [text-shadow:var(--card-hero-shadow)]'
/** The emblem's place over a piece's band and over the weapon's tile (share-card emblemBox). */
const BAND_EMBLEM_STYLE = emblemStyle(BAND_EMBLEM)
const WEAPON_EMBLEM_STYLE = emblemStyle(WEAPON_EMBLEM)

const c = computed(() => props.character)
const banner = computed(() => characterBanner(c.value.key))
/** The element's glow behind the splash (none for a character without an element). */
const glow = computed(() => (c.value.element ? elementGlow(c.value.element, props.theme) : 'none'))
const glyphs = computed(() => talentIcons(c.value.key))
const constellations = computed(() => constellationIcons(c.value.key))
const crown = useCrownIcon()
const weapon = computed(() => (c.value.weapon ? weaponLines(c.value.weapon) : null))
const cap = computed(() => levelCap(c.value.ascension, c.value.level))
const weaponCap = computed(() =>
  c.value.weapon ? levelCap(c.value.weapon.ascension, c.value.weapon.level) : 0,
)

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

/** Talent level colour: crowned gold first (Enka), then a C3/C5 boost in cyan. */
function talentTone(t: TalentLevel): string {
  return t.crowned ? 'text-talent-crown' : t.from ? 'text-talent-boost' : 'text-(--card-text)'
}

/**
 * A pill's colour on a band (BAND_TIER_COLOR): akasha's tiers are 5★ scales,
 * so 1–4★ pieces stay untiered; a CV above 0 below the first tier is white.
 */
function bandCv(rarity: number, cv: number, critCirclet: boolean) {
  const tier = rarity < 5 ? 0 : cvTier(cv, 'artifact', critCirclet)
  return {
    color: tier ? BAND_TIER_COLOR[tier] : cv > 0 ? BAND_CV_ON : BAND_TIER_COLOR[0],
    top: tier === 6,
  }
}
function bandRv(rarity: number, rv: number) {
  const tier = rarity < 5 || rv <= 0 ? 0 : rvTier(rv)
  return { color: BAND_TIER_COLOR[tier], top: tier === 6 }
}

/** Four substat lines per piece, empty ones kept, so the rows line up across the five. */
const pieces = computed(() =>
  SLOT_ORDER.map((slot, index) => {
    const piece = c.value.artifacts[index] ?? null
    if (!piece) {
      return { slot, piece, lines: [], cv: null, rv: null, title: SLOT_LABELS[slot] }
    }
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
    const cv = bandCv(piece.rarity, piece.cv, isCritCirclet(piece.slotKey, piece.mainStatKey))
    const rv = bandRv(piece.rarity, piece.rv)
    const title = [
      formatSetName(piece.setKey),
      `${SLOT_LABELS[slot]} +${piece.level} · ${piece.rarity}★`,
      `CV ${piece.cv.toFixed(1)} · RV ${piece.rv}% · ${rollCount} rolls (the first ones and one per +4)`,
    ].join('\n')
    return { slot, piece, lines, cv, rv, title }
  }),
)
/** The sets listed: 2 pieces or more (a single piece grants nothing). */
const bonus = computed(() => bonusSets(c.value.sets))
const rv = computed(() => buildRv(c.value.artifacts))
const buildRvTone = computed(() =>
  rv.value > 0 ? CRIT_TIER_TEXT[rvTier(rv.value, 'build')] : 'text-(--card-text)',
)
const buildCvTone = computed(() =>
  c.value.cv > 0 ? CRIT_TIER_TEXT[cvTier(c.value.cv, 'build')] : 'text-(--card-text)',
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
  ].filter((part): part is string => !!part),
)
</script>

<template>
  <div
    :data-theme="theme"
    class="relative overflow-hidden bg-(--card-ground) font-sans text-(--card-text) [font-variant-numeric:tabular-nums]"
    :style="ROOT"
  >
    <!-- One picture, back to front: the namecard blurred into atmosphere (it is only
         840×400; oversized so the blur has no edge), a scrim, the element's glow, the
         splash cut-out whole with its shadow, a full-width vignette. No boxes, no masks. -->
    <FadeImage
      :src="banner"
      class="pointer-events-none absolute top-[-40px] left-[-60px] h-[1160px] w-[2040px] max-w-none object-cover [filter:var(--card-namecard-filter)]"
    />
    <div class="absolute inset-0 [background:var(--card-scrim)]" />
    <div class="absolute inset-0" :style="{ background: glow }" />
    <SplashArt
      :character-key="c.key"
      :name="c.name"
      :rarity="c.rarity"
      :eager="still"
      class="absolute top-[-20px] h-[1100px] w-[2200px]"
      :style="{ left: `${SPLASH_LEFT}px` }"
      img-class="object-contain! [filter:var(--card-splash-shadow)]"
    />
    <div class="absolute inset-0 [background:var(--card-vignette)]" />

    <div
      class="absolute inset-[44px_48px_44px_48px] grid grid-cols-[700px_528px_532px] grid-rows-[minmax(0,1fr)] gap-x-[32px]"
    >
      <!-- Left: who, the constellations down its right edge, the talents at its foot -->
      <section class="relative flex min-h-0 flex-col justify-between" aria-label="Character">
        <div class="flex flex-col gap-[10px]">
          <div class="flex min-w-0 items-center gap-[18px]">
            <ElementIcon
              v-if="c.element"
              :element="c.element"
              decorative
              class="size-[60px]! [filter:drop-shadow(0_2px_6px_rgba(0,0,0,0.45))]"
            />
            <h1
              class="m-0 min-w-0 truncate leading-none font-bold tracking-[-0.5px]"
              :class="HERO"
              :style="{ fontSize: `${nameSize(c.name)}px` }"
            >
              {{ c.name }}
            </h1>
            <span
              class="ml-[6px] shrink-0 rounded-full px-[12px] py-[4px] text-[22px] font-bold"
              :class="
                isMaxConstellation(c.constellation)
                  ? ''
                  : 'bg-(--card-chip) text-(--card-hero) shadow-(--card-chip-ring)'
              "
              :style="isMaxConstellation(c.constellation) ? CONSTELLATION_MAX_STYLE : undefined"
              :title="`Constellation ${c.constellation} of 6`"
              >C{{ c.constellation }}</span
            >
          </div>
          <p class="flex items-baseline gap-[22px] pl-[4px] text-[30px]" :class="HERO">
            <span :title="`Level ${c.level} of ${cap} · Ascension ${c.ascension}`"
              ><span class="font-normal opacity-85">Lv.&nbsp;</span>
              <span class="font-bold">{{ c.level }}</span
              ><span class="font-medium opacity-70">/{{ cap }}</span></span
            >
            <template v-if="c.friendship !== null">
              <span class="opacity-50">·</span>
              <span
                ><span class="font-normal opacity-85">Friendship&nbsp;</span>
                <span class="font-bold">{{ c.friendship }}</span></span
              >
            </template>
          </p>
          <GameStars v-if="c.rarity" :rarity="c.rarity" :px="34" class="pl-[2px]" />
        </div>

        <ol
          class="absolute top-[150px] right-0 flex flex-col gap-[16px]"
          :aria-label="`Constellation ${c.constellation} of 6`"
        >
          <li
            v-for="(src, index) in constellations"
            :key="index"
            class="flex"
            :title="`C${index + 1}${index < c.constellation ? '' : ' · locked'}`"
          >
            <ElementDisc
              :src="src"
              :element="c.element"
              :px="84"
              :locked="index >= c.constellation"
              :fallback="`C${index + 1}`"
            />
          </li>
        </ol>

        <!-- Talents, then the owner and the capture date with the site, flush with the panels' foot -->
        <div class="flex flex-col gap-[22px]">
          <ul class="flex items-end gap-[30px]" aria-label="Talents">
            <li
              v-for="t in talents"
              :key="t.key"
              class="flex flex-col items-center gap-[10px]"
              :title="talentTitle(t)"
            >
              <ElementDisc :src="glyphs[t.key]" :element="c.element" :px="112" :glyph="90" />
              <span
                class="flex h-[40px] items-center gap-[6px] rounded-full bg-(--card-pill) px-[14px]"
                :class="t.crowned ? 'shadow-[inset_0_0_0_2px_var(--talent-crown)]' : ''"
              >
                <FadeImage
                  v-if="t.crowned"
                  :src="crown"
                  alt="Crowned"
                  class="ml-[-6px] size-[30px]"
                />
                <span class="text-[26px] font-bold" :class="talentTone(t)">{{ t.level }}</span>
              </span>
            </li>
          </ul>
          <div class="flex flex-col gap-[4px] pl-[4px]" :class="HERO">
            <p v-if="ownerLine.length" class="flex min-w-0 items-center gap-[14px] text-[27px]">
              <template v-for="(part, index) in ownerLine" :key="index">
                <span v-if="index" class="opacity-60">·</span>
                <span class="truncate" :class="index === 0 && owner.name ? 'font-semibold' : ''">{{
                  part
                }}</span>
              </template>
            </p>
            <p class="flex items-center gap-[12px] text-[20px] whitespace-nowrap opacity-80">
              <template v-if="takenAt">
                <span>{{ formatDate(takenAt) }}</span>
                <span class="opacity-60">·</span>
              </template>
              <span>genshin-tracker.475.dev</span>
            </p>
          </div>
        </div>
      </section>

      <!-- Middle: weapon, stats (they take the height left), sets and the build -->
      <section class="flex min-h-0 flex-col gap-[16px]" aria-label="Weapon and stats">
        <div
          v-if="c.weapon"
          class="flex items-center gap-[20px] px-[22px] py-[18px]"
          :class="PANEL"
        >
          <!-- The game's header art: the rarity's gradient, the emblem (48%), the icon -->
          <span
            class="relative size-[128px] shrink-0 overflow-hidden rounded-[16px]"
            :style="{ background: RARITY_GRADIENT[c.weapon.rarity ?? 0] ?? 'var(--card-cv-bg)' }"
          >
            <template v-if="qualityArt(c.weapon.rarity)">
              <FadeImage
                :src="qualityArt(c.weapon.rarity)"
                class="absolute inset-0 size-full max-w-none"
              />
              <span class="absolute opacity-48" :style="WEAPON_EMBLEM_STYLE">
                <FadeImage :src="EMBLEM_URL" class="size-full max-w-none" />
              </span>
            </template>
            <FadeImage
              :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
              class="relative size-[128px]"
            />
          </span>
          <div class="flex min-w-0 flex-col gap-[8px]">
            <p class="truncate text-[30px] leading-[1.1] font-semibold" :title="c.weapon.name">
              {{ c.weapon.name }}
            </p>
            <p class="flex items-center gap-[12px] text-[22px]">
              <span
                :title="`Level ${c.weapon.level} of ${weaponCap} · Ascension ${c.weapon.ascension}`"
                ><span class="text-(--card-muted)">Lv.&nbsp;</span>
                <span class="font-semibold">{{ c.weapon.level }}</span
                ><span class="text-(--card-muted)">/{{ weaponCap }}</span></span
              >
              <span
                class="rounded-[8px] px-[10px] py-[2px] font-bold"
                :style="refinementStyle(c.weapon.refinement)"
                :title="`Refinement ${c.weapon.refinement} of 5`"
                >R{{ c.weapon.refinement }}</span
              >
              <GameStars v-if="c.weapon.rarity" :rarity="c.weapon.rarity" :px="22" />
            </p>
            <p v-if="weapon" class="flex flex-wrap gap-x-[22px] text-[24px]">
              <span
                v-for="stat in [weapon.atk, weapon.sub].filter((s) => s !== null)"
                :key="stat.key"
                class="whitespace-nowrap"
                ><span class="text-(--card-muted)"
                  >{{ stat.key === 'baseAtk' ? 'ATK' : formatStatShort(stat.key) }}&nbsp;</span
                >
                <span class="font-bold">{{ stat.text }}</span></span
              >
            </p>
          </div>
        </div>
        <div
          v-else
          class="flex h-[164px] shrink-0 items-center justify-center text-[24px] text-(--card-muted)"
          :class="PANEL"
        >
          No weapon
        </div>

        <div class="flex min-h-0 flex-[1_1_auto] flex-col px-[26px] py-[10px]" :class="PANEL">
          <dl v-if="panel" class="flex flex-1 flex-col">
            <div
              v-for="(row, index) in panel.rows"
              :key="row.key"
              class="flex flex-[1_1_0] items-center gap-[12px]"
              :class="index < panel.rows.length - 1 ? 'border-b border-(--card-rule)' : ''"
              :title="statTitle(row)"
            >
              <dt
                class="flex min-w-0 flex-[1_1_auto] items-center gap-[10px] truncate text-[25px]"
                :class="row.damage ? DAMAGE_TEXT[row.damage] : 'text-(--card-secondary)'"
              >
                <ElementIcon
                  v-if="row.damage && row.damage !== 'physical'"
                  :element="row.damage"
                  decorative
                  class="size-[26px]!"
                />
                {{ row.label }}
              </dt>
              <dd
                v-if="row.base !== undefined && row.bonus"
                class="text-[23px] font-medium whitespace-nowrap text-(--card-secondary)"
              >
                {{ formatPanelValue(row.key, row.base) }}
                <span class="font-semibold text-(--card-bonus)"
                  >+{{ formatPanelValue(row.key, row.bonus) }}</span
                >
              </dd>
              <dd
                class="min-w-[110px] text-right text-[30px] font-bold"
                :class="row.damage ? DAMAGE_TEXT[row.damage] : ''"
              >
                {{ row.text }}
              </dd>
            </div>
          </dl>
          <p v-else class="m-auto text-[24px] text-(--card-muted)" title="Newer than the game data">
            No stats
          </p>
        </div>

        <div class="flex flex-col gap-[12px] px-[24px] py-[18px]" :class="PANEL">
          <p
            v-for="{ set, pieces } in bonus"
            :key="set.setKey"
            class="flex items-center gap-[14px]"
            :title="setTitle(set)"
          >
            <span class="size-[44px] shrink-0">
              <FadeImage :src="artifactSetIcon(set.setKey)" class="size-full" />
            </span>
            <span class="min-w-0 flex-[1_1_auto] truncate text-[23px]">{{ set.name }}</span>
            <span
              class="min-w-[36px] rounded-[10px] bg-(--card-set-on-bg) px-[10px] py-[2px] text-center text-[22px] font-bold text-(--card-set-on)"
              :title="`${pieces}-piece bonus`"
              >{{ pieces }}</span
            >
          </p>
          <p v-if="!c.artifactCount" class="text-[22px] text-(--card-muted)">No artifacts</p>
          <p
            v-else
            class="flex items-baseline gap-[18px] text-[20px] whitespace-nowrap"
            :class="bonus.length ? 'border-t border-(--card-rule) pt-[10px]' : ''"
          >
            <span class="text-(--card-muted)">Build</span>
            <span
              class="ml-auto"
              title="Roll value: every substat roll as a % of its highest roll, added up"
              ><span class="text-(--card-muted)">RV </span
              ><span class="font-bold" :class="buildRvTone">{{ rv }}%</span></span
            >
            <span title="Crit value"
              ><span class="text-(--card-muted)">CV </span
              ><span class="font-bold" :class="buildCvTone">{{ c.cv.toFixed(1) }}</span></span
            >
          </p>
        </div>
      </section>

      <!-- Right: the five pieces fill the column -->
      <ol class="flex min-h-0 flex-col gap-[14px]" aria-label="Artifacts">
        <li
          v-for="{ slot, piece, lines, cv, rv, title } in pieces"
          :key="slot"
          class="flex min-h-0 min-w-0 flex-[1_1_0]"
        >
          <article
            v-if="piece"
            class="flex min-w-0 flex-1 items-stretch overflow-hidden"
            :class="PANEL"
            :title="title"
          >
            <!-- The band: the game's header art (rarity gradient, emblem at 70%), a shade
                 under the text, the icon, the level; the main stat, stars, CV and RV -->
            <div
              class="relative w-[252px] shrink-0 overflow-hidden"
              :style="{ background: RARITY_GRADIENT[piece.rarity] ?? 'var(--card-cv-bg)' }"
            >
              <template v-if="qualityArt(piece.rarity)">
                <FadeImage
                  :src="qualityArt(piece.rarity)"
                  class="absolute inset-0 size-full max-w-none"
                />
                <span class="absolute opacity-70" :style="BAND_EMBLEM_STYLE">
                  <FadeImage :src="EMBLEM_URL" class="size-full max-w-none" />
                </span>
              </template>
              <span
                class="absolute inset-0 bg-[linear-gradient(90deg,rgba(40,20,8,0.22)_0%,rgba(40,20,8,0)_50%)]"
                aria-hidden="true"
              />
              <span class="absolute inset-y-0 right-[16px] flex items-center">
                <FadeImage
                  :src="artifactIcon(piece.setKey, piece.slotKey)"
                  class="size-[128px] [filter:drop-shadow(0_4px_10px_rgba(70,36,6,0.35))]"
                />
              </span>
              <span
                class="absolute right-[10px] bottom-[10px] rounded-[8px] bg-[rgba(30,16,4,0.55)] px-[8px] py-px text-[17px] font-bold text-white"
                >+{{ piece.level }}</span
              >
              <div
                class="relative box-border flex h-full w-[132px] flex-col justify-center gap-[3px] py-[12px] pl-[18px]"
              >
                <span
                  class="text-[18px] font-medium whitespace-nowrap text-[rgba(255,248,235,0.95)] [text-shadow:0_1px_2px_rgba(70,36,6,0.6)]"
                  >{{ formatStatShort(piece.mainStatKey) }}</span
                >
                <span
                  class="text-[38px] leading-[1.05] font-bold whitespace-nowrap text-white [text-shadow:0_1px_3px_rgba(70,36,6,0.6)]"
                  >{{
                    piece.mainStatValue === null
                      ? '—'
                      : formatStatValue(piece.mainStatKey, piece.mainStatValue)
                  }}</span
                >
                <GameStars
                  :rarity="piece.rarity"
                  :px="15"
                  :gap="1"
                  class="pt-[2px] pb-[4px] [filter:drop-shadow(0_1px_1px_rgba(70,36,6,0.5))]!"
                />
                <span class="flex flex-col items-start gap-[4px] text-[16px] whitespace-nowrap">
                  <span
                    class="rounded-[6px] bg-[rgba(30,16,4,0.5)] px-[7px] py-px font-semibold"
                    :class="cv?.top ? 'cv-glow' : ''"
                    :style="{ color: cv?.color }"
                    >CV {{ piece.cv.toFixed(1) }}</span
                  >
                  <span
                    class="rounded-[6px] bg-[rgba(30,16,4,0.5)] px-[7px] py-px font-semibold"
                    :class="rv?.top ? 'cv-glow' : ''"
                    :style="{ color: rv?.color }"
                    >RV {{ piece.rv }}%</span
                  >
                </span>
              </div>
            </div>
            <div
              class="flex min-w-0 flex-[1_1_auto] flex-col justify-around py-[8px] pr-[12px] pl-[18px]"
            >
              <p
                v-for="n in 4"
                :key="n"
                class="flex h-[28px] items-center gap-[8px]"
                :class="lines[n - 1]?.inactive ? 'opacity-45' : ''"
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
                    class="min-w-0 flex-[1_1_auto] truncate text-[19px] text-(--card-secondary)"
                    >{{ formatStatShort(lines[n - 1]!.key) }}</span
                  >
                  <span class="text-right text-[21px] font-semibold whitespace-nowrap">{{
                    formatStatValue(lines[n - 1]!.key, lines[n - 1]!.value)
                  }}</span>
                  <CardRollBars :rolls="lines[n - 1]!.inactive ? [] : lines[n - 1]!.rolls" />
                </template>
              </p>
            </div>
          </article>
          <div
            v-else
            class="flex flex-1 items-center justify-center text-[24px] text-(--card-muted)"
            :class="PANEL"
          >
            {{ SLOT_LABELS[slot] }}
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
