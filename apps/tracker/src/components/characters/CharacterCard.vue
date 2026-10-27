<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { Heart, Wrench } from 'lucide-vue-next'
import ConstellationStars from '@/components/ui/ConstellationStars.vue'
import CritValue from '@/components/ui/CritValue.vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import {
  ELEMENT_LABELS,
  TARGET_LEVEL,
  WEAPON_TYPE_LABELS,
  type CharacterView,
} from '@/data/characters'
import { artifactSetIcon, characterBanner, characterIcon, weaponIcon } from '@/lib/assets'
import { useExpNeed } from '@/lib/exp-need'
import { formatDate, formatFullDateTime, formatNumber, formatShort } from '@/lib/format'
import { formatLevel } from '@/lib/level'
import FavoriteStar from './FavoriteStar.vue'
import NamecardBackdrop from './NamecardBackdrop.vue'
import TalentChips from './TalentChips.vue'

/**
 * One character in the roster grid, over its namecard: visual only; the card
 * opens the details. The favourite star sits on the portrait's corner, beside
 * the card's button (a button can't hold another).
 */
const props = defineProps<{
  character: CharacterView
  favorite?: boolean
  /** The first screen of the roster: its pictures load first (see NamecardBackdrop). */
  priority?: 'high' | 'low'
}>()
defineEmits<{ open: []; favorite: [] }>()

const c = computed(() => props.character)

const label = computed(
  () =>
    t('characters.card.label', {
      name: c.value.name,
      level: formatLevel(c.value.level, c.value.ascension),
      constellation: c.value.constellation,
      auto: c.value.talent.auto,
      skill: c.value.talent.skill,
      burst: c.value.talent.burst,
    }) +
    (c.value.friendship !== null ? t('characters.card.friendship', { n: c.value.friendship }) : ''),
)
const kind = computed(() =>
  [
    c.value.element ? ELEMENT_LABELS[c.value.element] : null,
    c.value.weaponType ? WEAPON_TYPE_LABELS[c.value.weaponType] : null,
  ]
    .filter(Boolean)
    .join(' · '),
)
const gapText = computed(() => c.value.gaps.map((g) => g.text).join(' · '))

/**
 * The two bars under the name (Capture's `gi_characters`): level EXP and
 * friendship, each "Max" at its cap, else the EXP toward the next level.
 * A bar the capture can't fill (no EXP sent) is left out.
 */
const expNeed = useExpNeed()
const bars = computed(() => {
  const need = expNeed.value
  if (!need) return []
  const ch = c.value
  const out: {
    key: string
    label: string
    /** A word before the label that goes in a narrow column ("Friendship"). */
    word?: string
    exp: number | null
    need: number | null
    title: string
    friendship: boolean
  }[] = []
  const levelNeed = need.character(ch.level, ch.ascension)
  if (levelNeed === null || ch.exp !== null) {
    out.push({
      key: 'level',
      label: `Lv. ${ch.level}`,
      exp: ch.exp,
      need: levelNeed,
      title:
        levelNeed === null
          ? t('characters.card.levelMax')
          : t('characters.card.levelExp', {
              exp: formatNumber(ch.exp ?? 0),
              need: formatNumber(levelNeed),
            }),
      friendship: false,
    })
  }
  if (ch.friendship !== null) {
    const friendshipNeed = need.friendship(ch.friendship)
    out.push({
      key: 'friendship',
      label: String(ch.friendship),
      word: t('game.friendship'),
      exp: ch.friendshipExp,
      need: friendshipNeed,
      title:
        friendshipNeed === null || ch.friendshipExp === null
          ? t('characters.friendship.title', { level: ch.friendship })
          : t('characters.card.friendshipExp', {
              level: ch.friendship,
              exp: formatNumber(ch.friendshipExp),
              need: formatNumber(friendshipNeed),
            }),
      friendship: true,
    })
  }
  return out
})
const percent = (bar: { exp: number | null; need: number | null }) =>
  bar.need === null ? 100 : Math.min(100, ((bar.exp ?? 0) / bar.need) * 100)
const weaponTitle = computed(() => {
  const w = c.value.weapon
  return w
    ? `${w.name} · ${formatLevel(w.level, w.ascension)} · R${w.refinement}`
    : t('characters.gap.noWeapon')
})
</script>

<template>
  <div class="group/fav relative flex w-full">
    <button
      type="button"
      aria-haspopup="dialog"
      :aria-label="label"
      class="group relative flex w-full flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised text-left shadow-sm transition-colors hover:border-border-strong"
      @click="$emit('open')"
    >
      <!-- The namecard under the whole card (light: lighter and softer; dark: a
           little dimmer, the user's tuning); the foot
           shows a blurred copy of it (a filtered image is drawn once, unlike a
           backdrop blur, which repaints on every scroll frame). Loaded up front:
           the roster shows every card. -->
      <NamecardBackdrop
        :src="characterBanner(c.key)"
        :priority="priority"
        class="absolute inset-y-0 right-0 h-full w-full opacity-45 brightness-[1.35] saturate-[1.1] [mask-image:linear-gradient(to_left,black_35%,transparent_95%)] sm:w-5/6 dark:opacity-40 dark:brightness-[1.1]"
      />
      <div class="relative w-full">
        <div class="relative flex w-full items-start gap-3 p-3">
          <GameIcon
            :src="characterIcon(c.key)"
            :name="c.name"
            :rarity="c.rarity ?? undefined"
            size="lg"
            eager
            :priority="priority"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex items-center gap-1.5">
              <ElementIcon v-if="c.element" :element="c.element" size="lg" />
              <p class="min-w-0 truncate font-display text-base font-semibold" :title="kind">
                {{ c.name }}
              </p>
              <LevelText
                :level="c.level"
                :ascension="c.ascension"
                :target="TARGET_LEVEL"
                class="flex-none text-sm text-text-primary"
              />
              <span class="flex-1" aria-hidden="true" />
              <UiBadge v-if="c.gaps.length" tone="warning" mono class="shrink-0" :title="gapText">
                <Wrench class="size-3.5" aria-hidden="true" />
                {{ c.gaps.length }}
                <span class="sr-only">{{ $t('characters.card.toDo', { gaps: gapText }) }}</span>
              </UiBadge>
            </div>
            <div v-if="bars.length" class="grid grid-cols-2 gap-4">
              <div
                v-for="bar in bars"
                :key="bar.key"
                class="@container flex min-w-0 flex-col gap-1"
                :title="bar.title"
              >
                <span class="tabular flex items-center justify-between gap-2 text-sm">
                  <span class="flex min-w-0 flex-none items-center gap-1">
                    <Heart
                      v-if="bar.friendship"
                      class="size-3.5 flex-none fill-current text-friendship"
                      aria-hidden="true"
                    />
                    <span class="whitespace-nowrap"
                      ><span v-if="bar.word" class="hidden @[10.5rem]:inline">{{ bar.word }} </span
                      >{{ bar.label }}</span
                    >
                  </span>
                  <span v-if="bar.need === null" class="flex-none text-text-muted">{{
                    $t('characters.card.max')
                  }}</span>
                  <span v-else class="min-w-0 truncate font-mono text-text-secondary">
                    {{ formatShort(bar.exp ?? 0)
                    }}<span class="text-text-muted">/{{ formatShort(bar.need) }}</span>
                  </span>
                </span>
                <span
                  class="block h-[5px] overflow-hidden rounded-full bg-surface-sunken"
                  aria-hidden="true"
                >
                  <span
                    class="block h-full rounded-full"
                    :class="bar.friendship ? 'bg-friendship' : 'bg-accent'"
                    :style="{ width: `${percent(bar)}%` }"
                  />
                </span>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <ConstellationStars :value="c.constellation" :element="c.element" :label="false" />
              <TalentChips :talent="c.talent" />
            </div>
          </div>
        </div>
      </div>

      <div
        class="relative isolate mt-auto flex w-full items-center gap-2 overflow-hidden border-t border-border-subtle/70 px-3 py-2 text-sm"
      >
        <span class="absolute inset-0 -z-10 bg-surface-raised/75" aria-hidden="true" />
        <NamecardBackdrop
          :src="characterBanner(c.key)"
          :priority="priority"
          class="absolute right-0 bottom-0 -z-10 h-[calc(100%+6rem)] w-full opacity-35 blur-md [mask-image:linear-gradient(to_left,black_35%,transparent_95%)] sm:w-5/6 dark:opacity-30"
        />
        <span v-if="c.weapon" class="flex shrink-0 items-center gap-1.5" :title="weaponTitle">
          <GameIcon
            :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
            :name="c.weapon.name"
            :rarity="c.weapon.rarity ?? undefined"
            size="xs"
            eager
          />
          <span class="tabular font-mono">R{{ c.weapon.refinement }}</span>
          <LevelText
            v-if="c.weapon.level < TARGET_LEVEL"
            :level="c.weapon.level"
            :ascension="c.weapon.ascension"
            :target="TARGET_LEVEL"
          />
        </span>
        <span
          v-else
          class="size-7 shrink-0 rounded-lg border border-dashed border-border-strong"
          :title="weaponTitle"
        />

        <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span
            v-for="set in c.activeSets.slice(0, 2)"
            :key="set.setKey"
            class="flex shrink-0 items-center gap-1"
            :title="`${set.name} ×${set.count}`"
          >
            <GameIcon
              :src="artifactSetIcon(set.setKey)"
              :name="set.name"
              :rarity="set.rarity"
              size="xs"
              eager
            />
            <span class="tabular font-mono">{{ set.count }}</span>
          </span>
        </span>

        <CritValue
          v-if="c.artifactCount > 0"
          :value="c.cv"
          scope="build"
          label
          class="shrink-0"
          :detail="$t('characters.card.critDetail', { rate: c.critRate, dmg: c.critDmg })"
        />
        <span
          v-if="c.obtainedAt !== null"
          class="shrink-0 text-xs text-text-muted"
          :title="$t('characters.card.obtainedAt', { date: formatFullDateTime(c.obtainedAt) })"
          >{{ $t('characters.card.since', { date: formatDate(c.obtainedAt) }) }}</span
        >
      </div>
    </button>
    <FavoriteStar
      :on="favorite"
      :name="c.name"
      class="absolute top-0.5 left-0.5 bg-surface-raised/90 shadow-sm"
      @toggle="$emit('favorite')"
    />
  </div>
</template>
