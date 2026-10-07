<script setup lang="ts">
import { computed } from 'vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import {
  bonusSets,
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
import { CRIT_TIER_TEXT, cvTier, isCritCirclet } from '@/lib/crit-tiers'
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
import SplashArt from './SplashArt.vue'
import {
  CARD_HEIGHT,
  CARD_THEMES,
  CARD_WIDTH,
  RARITY_GRADIENT,
  nameSize,
  type CardOwner,
} from './share-card'
import { constellationIcons, talentIcons } from './talent-icons'
import { ELEMENT_TEXT } from './tokens'
import { useCrownIcon } from './use-boosts'

/**
 * The build as one 1920×1080 card, after the "Character Showcase Card"
 * design: on the namecard, the splash art fading into it; name, level,
 * friendship and stars, the constellations down the left column's edge and
 * the talents at its foot; weapon, the in-game stats and the sets in the
 * middle; the five pieces on the right; owner and site along the bottom.
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
}>()

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

const c = computed(() => props.character)
const banner = computed(() => characterBanner(c.value.key))
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

/** Four substat lines per piece, empty ones kept, so the rows line up across the five. */
const pieces = computed(() =>
  SLOT_ORDER.map((slot, index) => {
    const piece = c.value.artifacts[index] ?? null
    if (!piece) {
      return { slot, piece, lines: [], rollCount: 0, cvTone: '', title: SLOT_LABELS[slot] }
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
    // akasha's tiers are 5★ scales: 1–4★ pieces and a CV of 0 stay muted.
    const tier = cvTier(piece.cv, 'artifact', isCritCirclet(piece.slotKey, piece.mainStatKey))
    const cvTone = piece.rarity < 5 || piece.cv <= 0 ? 'text-(--card-muted)' : CRIT_TIER_TEXT[tier]
    const title = [
      formatSetName(piece.setKey),
      `${SLOT_LABELS[slot]} +${piece.level} · ${piece.rarity}★`,
      `CV ${piece.cv.toFixed(1)} · RV ${piece.rv}% · ${rollCount} rolls (the first ones and one per +4)`,
    ].join('\n')
    return { slot, piece, lines, rollCount, cvTone, title }
  }),
)
/** The sets listed: 2 pieces or more (a single piece grants nothing). */
const bonus = computed(() => bonusSets(c.value.sets))
const buildRolls = computed(() => pieces.value.reduce((sum, p) => sum + p.rollCount, 0))
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
    <!-- One picture: the namecard full-bleed, a light scrim, the splash fading into it -->
    <img
      v-if="banner"
      :src="banner"
      alt=""
      class="pointer-events-none absolute inset-0 size-full object-cover [filter:var(--card-namecard-filter)]"
    />
    <div class="absolute inset-0 [background:var(--card-scrim)]" />
    <SplashArt
      :character-key="c.key"
      :name="c.name"
      :rarity="c.rarity"
      eager
      class="absolute top-[-30px] left-[-720px] h-[1140px] w-[2280px] [mask-image:linear-gradient(90deg,#000_0%,#000_58%,rgba(0,0,0,0.6)_64%,transparent_72%)]"
    />
    <!-- Legibility fades behind the name and the talents; they also fade out sideways (no edge) -->
    <div
      class="absolute bottom-0 left-0 h-[420px] w-[820px] [background:var(--card-fade-bottom)] [mask-image:linear-gradient(90deg,#000_55%,transparent)]"
    />
    <div
      class="absolute top-0 left-0 h-[300px] w-[820px] [background:var(--card-fade-top)] [mask-image:linear-gradient(90deg,#000_55%,transparent)]"
    />

    <div
      class="absolute inset-[44px_48px_40px_48px] grid grid-cols-[700px_528px_532px] grid-rows-[minmax(0,1fr)_36px] gap-x-[32px] gap-y-[16px]"
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
              class="ml-[6px] shrink-0 rounded-full bg-(--card-chip) px-[12px] py-[4px] text-[22px] font-bold text-(--card-hero) shadow-(--card-chip-ring)"
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

        <ul class="flex items-end gap-[30px]" aria-label="Talents">
          <li
            v-for="t in talents"
            :key="t.key"
            class="flex flex-col items-center gap-[10px]"
            :title="talentTitle(t)"
          >
            <ElementDisc :src="glyphs[t.key]" :element="c.element" :px="112" />
            <span
              class="flex h-[40px] items-center gap-[6px] rounded-full bg-(--card-pill) px-[14px]"
              :class="t.crowned ? 'shadow-[inset_0_0_0_2px_var(--talent-crown)]' : ''"
            >
              <img
                v-if="t.crowned && crown"
                :src="crown"
                alt="Crowned"
                class="ml-[-6px] size-[30px]"
              />
              <span class="text-[26px] font-bold" :class="talentTone(t)">{{ t.level }}</span>
            </span>
          </li>
        </ul>
      </section>

      <!-- Middle: weapon, stats (they take the height left), sets and the build -->
      <section class="flex min-h-0 flex-col gap-[16px]" aria-label="Weapon and stats">
        <div
          v-if="c.weapon"
          class="flex items-center gap-[20px] px-[22px] py-[18px]"
          :class="PANEL"
        >
          <span
            class="relative size-[128px] shrink-0 overflow-hidden rounded-[16px]"
            :style="{ background: RARITY_GRADIENT[c.weapon.rarity ?? 0] ?? 'var(--card-cv-bg)' }"
          >
            <img
              v-if="weaponIcon(c.weapon.key, c.weapon.ascension)"
              :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
              alt=""
              class="size-[128px]"
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
                class="rounded-[8px] bg-game-star px-[10px] py-[2px] font-bold text-public-ground"
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
            <p
              v-if="weapon?.passive.length"
              class="truncate text-[17px] text-(--card-secondary)"
              :title="weapon.passive.map((s) => `${s.label} +${s.text}`).join(', ')"
            >
              Passive
              {{ weapon.passive.map((s) => `${formatStatShort(s.key)} +${s.text}`).join(' · ') }}
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
                class="text-[19px] whitespace-nowrap text-(--card-muted)"
              >
                {{ formatPanelValue(row.key, row.base) }}
                <span class="text-(--card-bonus)">+{{ formatPanelValue(row.key, row.bonus) }}</span>
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
            <img
              v-if="artifactSetIcon(set.setKey)"
              :src="artifactSetIcon(set.setKey)"
              alt=""
              class="size-[44px] shrink-0"
            />
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
            class="flex items-baseline gap-[18px]"
            :class="bonus.length ? 'border-t border-(--card-rule) pt-[10px]' : ''"
          >
            <span class="text-[20px] text-(--card-muted)">Build</span>
            <span class="text-[20px] text-(--card-muted)">{{ buildRolls }} rolls</span>
            <span class="ml-auto text-[22px] text-(--card-muted)">CV</span>
            <span class="text-[38px] leading-none font-bold" :class="buildCvTone">{{
              c.cv.toFixed(1)
            }}</span>
          </p>
        </div>
      </section>

      <!-- Right: the five pieces fill the column -->
      <ol class="flex min-h-0 flex-col gap-[14px]" aria-label="Artifacts">
        <li
          v-for="{ slot, piece, lines, rollCount, cvTone, title } in pieces"
          :key="slot"
          class="flex min-h-0 min-w-0 flex-[1_1_0]"
        >
          <article
            v-if="piece"
            class="flex min-w-0 flex-1 items-center gap-[12px] overflow-hidden py-0 pr-[14px] pl-0"
            :class="PANEL"
            :title="title"
          >
            <span
              class="relative flex w-[150px] shrink-0 items-center justify-center self-stretch"
              :style="{ background: RARITY_GRADIENT[piece.rarity] ?? 'var(--card-cv-bg)' }"
            >
              <img
                v-if="artifactIcon(piece.setKey, piece.slotKey)"
                :src="artifactIcon(piece.setKey, piece.slotKey)"
                alt=""
                class="size-[136px]"
              />
              <span
                class="absolute right-[8px] bottom-[8px] rounded-[8px] bg-(--card-badge) px-[8px] py-px text-[17px] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                :class="piece.maxed ? 'text-(--card-secondary)' : 'text-talent-crown'"
                >+{{ piece.level }}</span
              >
            </span>
            <div class="flex w-[118px] shrink-0 flex-col gap-[2px]">
              <span class="text-[18px] whitespace-nowrap text-(--card-muted)">{{
                formatStatShort(piece.mainStatKey)
              }}</span>
              <span class="text-[38px] leading-[1.05] font-bold whitespace-nowrap">{{
                piece.mainStatValue === null
                  ? '—'
                  : formatStatValue(piece.mainStatKey, piece.mainStatValue)
              }}</span>
              <span class="flex items-center gap-[5px] text-[15px] whitespace-nowrap">
                <span
                  class="rounded-[6px] bg-(--card-cv-bg) px-[6px] py-px font-semibold"
                  :class="cvTone"
                  >CV {{ piece.cv.toFixed(1) }}</span
                >
                <span class="text-(--card-muted)">{{ rollCount }} rolls</span>
              </span>
            </div>
            <span class="w-px self-stretch bg-(--card-divider)" aria-hidden="true" />
            <div
              class="flex min-w-0 flex-[1_1_auto] flex-col justify-around self-stretch py-[10px]"
            >
              <p
                v-for="n in 4"
                :key="n"
                class="flex h-[28px] items-center gap-[6px]"
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
                    class="min-w-0 flex-[1_1_auto] truncate text-[18px] text-(--card-secondary)"
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

      <!-- Foot: owner on the left, capture date and site on the right -->
      <p class="col-start-1 flex min-w-0 items-center gap-[12px] text-[21px]" :class="HERO">
        <template v-for="(part, index) in ownerLine" :key="index">
          <span v-if="index" class="opacity-60">·</span>
          <span class="truncate" :class="index === 0 && owner.name ? 'font-semibold' : ''">{{
            part
          }}</span>
        </template>
      </p>
      <p class="col-span-2 col-start-2 flex items-center justify-end">
        <span
          class="rounded-[10px] bg-(--card-panel) px-[14px] py-[4px] text-[18px] whitespace-nowrap text-(--card-secondary) shadow-(--card-panel-shadow)"
          ><template v-if="takenAt">{{ formatDate(takenAt) }} · </template
          >genshin-tracker.475.dev</span
        >
      </p>
    </div>
  </div>
</template>
