<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useElementSize } from '@vueuse/core'
import { Wrench } from 'lucide-vue-next'
import ConstellationStars from '@/components/ui/ConstellationStars.vue'
import CritValue from '@/components/ui/CritValue.vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import type { AccountRef } from '@/data/account-data'
import { buildPanel, talentLevels } from '@/data/character-build'
import {
  ELEMENT_LABELS,
  SLOT_ORDER,
  TARGET_LEVEL,
  WEAPON_TYPE_LABELS,
  type CharacterView,
} from '@/data/characters'
import { loadCharacterHistory } from '@/data/characters-history'
import { useResource } from '@/data/use-resource'
import { characterBanner } from '@/lib/assets'
import { formatDate, formatFullDateTime } from '@/lib/format'
import ArtifactPiece from './ArtifactPiece.vue'
import BuildStats from './BuildStats.vue'
import CharacterTimeline from './CharacterTimeline.vue'
import ConstellationIcons from './ConstellationIcons.vue'
import FriendshipBadge from './FriendshipBadge.vue'
import NamecardBackdrop from './NamecardBackdrop.vue'
import SetBonuses from './SetBonuses.vue'
import ShareCard from './ShareCard.vue'
import SplashArt from './SplashArt.vue'
import TalentLevels from './TalentLevels.vue'
import WeaponBlock from './WeaponBlock.vue'
import { CARD_HEIGHT, CARD_WIDTH, type CardOwner } from './share-card'
import { ELEMENT_GLOW } from './tokens'
import { useConstellationBoosts } from './use-boosts'

/**
 * Everything about one character. Wide (`showcase`): the share card itself
 * (ShareCard, Enka-style), scaled to the width, as the page shows it and
 * the PNG export draws it; then what is left to do and the history.
 * Narrow: the same build stacked to read on a phone (splash art with the
 * constellations, level, talents with C3/C5, weapon, the in-game stats,
 * sets, the five pieces), and the card is rendered off screen only when
 * an export asks for it (`offscreen`). `cardElement()` is the card's root
 * for the export.
 */
const props = defineProps<{
  character: CharacterView
  account: AccountRef
  showcase: boolean
  offscreen: boolean
  cardTheme: 'light' | 'dark'
  owner: CardOwner
  takenAt: number | null
}>()

const card = useTemplateRef<InstanceType<typeof ShareCard>>('card')
const frame = useTemplateRef<HTMLElement>('frame')
const { width: frameWidth } = useElementSize(frame)
const scale = computed(() => (frameWidth.value ? frameWidth.value / CARD_WIDTH : 0))

defineExpose({
  cardElement: (): HTMLElement | null => (card.value?.$el as HTMLElement | undefined) ?? null,
})

const c = computed(() => props.character)

const boosts = useConstellationBoosts(() => c.value.key)
const talents = computed(() => talentLevels(c.value.talent, c.value.constellation, boosts.value))
const panel = computed(() => buildPanel(c.value))

// The namecard art behind the build (gone at once when stepping to the next character).
const banner = computed(() => characterBanner(c.value.key))
const glow = computed(() =>
  c.value.element ? ELEMENT_GLOW[c.value.element] : 'from-border-default',
)
const kind = computed(() =>
  [
    c.value.element ? ELEMENT_LABELS[c.value.element] : null,
    c.value.weaponType ? WEAPON_TYPE_LABELS[c.value.weaponType] : null,
  ]
    .filter(Boolean)
    .join(' · '),
)

const history = useResource(
  () => props.account,
  (account) => loadCharacterHistory(account),
)
const changes = computed(() => history.data.value?.get(c.value.key) ?? [])
</script>

<template>
  <div class="flex flex-col gap-5">
    <template v-if="showcase">
      <div
        ref="frame"
        class="relative w-full overflow-hidden rounded-xl border border-border-default bg-surface-sunken"
        :style="{ height: `${CARD_HEIGHT * scale}px` }"
      >
        <div
          class="absolute top-0 left-0 origin-top-left"
          :style="{ transform: `scale(${scale})` }"
        >
          <ShareCard
            ref="card"
            :character="c"
            :panel="panel"
            :talents="talents"
            :theme="cardTheme"
            :owner="owner"
            :taken-at="takenAt"
          />
        </div>
      </div>
      <p v-if="c.gaps.length" class="flex flex-wrap items-center gap-1.5">
        <Wrench class="size-4 text-warning-text" aria-hidden="true" />
        <span class="sr-only">To do:</span>
        <UiBadge v-for="gap in c.gaps" :key="gap.kind" tone="warning">{{ gap.text }}</UiBadge>
      </p>
    </template>

    <template v-else>
      <section
        class="relative overflow-hidden rounded-xl border border-border-default bg-surface-base"
        aria-label="Build"
      >
        <!-- The namecard in its own colours under a light scrim, and the element's tint -->
        <NamecardBackdrop :src="banner" class="absolute inset-0 size-full" />
        <div class="pointer-events-none absolute inset-0 bg-surface-base/55" />
        <div
          class="pointer-events-none absolute inset-0 bg-linear-to-br via-transparent to-transparent"
          :class="glow"
        />

        <div class="relative grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <!-- Splash art, constellations down its right edge -->
          <div class="relative h-72 min-[480px]:h-80 md:row-span-2 md:h-auto md:min-h-[26rem]">
            <SplashArt
              :character-key="c.key"
              :name="c.name"
              :rarity="c.rarity"
              class="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_75%,transparent)] md:[mask-image:linear-gradient(to_right,black_80%,transparent)]"
              img-class="scale-[1.15] object-[50%_30%]"
            />
            <ConstellationIcons
              :character-key="c.key"
              :value="c.constellation"
              :element="c.element"
              class="absolute top-1/2 right-3 -translate-y-1/2 md:right-1"
            />
          </div>

          <!-- Who: name, level, friendship, constellation; talents; weapon -->
          <div class="flex min-w-0 flex-col gap-4 p-4 sm:p-5 md:pl-3">
            <header class="flex min-w-0 flex-col gap-1.5">
              <p class="flex min-w-0 items-center gap-2">
                <ElementIcon v-if="c.element" :element="c.element" size="lg" />
                <span
                  class="min-w-0 truncate font-display text-2xl font-semibold sm:text-3xl"
                  :title="kind"
                  >{{ c.name }}</span
                >
              </p>
              <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                <RarityStars v-if="c.rarity" :rarity="c.rarity" />
                <span v-if="c.weaponType">{{ WEAPON_TYPE_LABELS[c.weaponType] }}</span>
                <time
                  v-if="c.obtainedAt !== null"
                  :datetime="new Date(c.obtainedAt).toISOString()"
                  :title="`Obtained ${formatFullDateTime(c.obtainedAt)}`"
                  >{{ formatDate(c.obtainedAt) }}</time
                >
              </p>
              <p class="flex flex-wrap items-center gap-x-4 gap-y-1">
                <LevelText
                  :level="c.level"
                  :ascension="c.ascension"
                  :target="TARGET_LEVEL"
                  class="text-lg font-medium"
                />
                <FriendshipBadge
                  v-if="c.friendship !== null"
                  :level="c.friendship"
                  class="text-sm text-text-secondary"
                />
                <ConstellationStars :value="c.constellation" :element="c.element" />
              </p>
            </header>
            <TalentLevels :character-key="c.key" :levels="talents" :element="c.element" />
            <WeaponBlock :weapon="c.weapon" :account-id="account.id" />
          </div>

          <!-- The in-game stat panel -->
          <div class="min-w-0 px-4 pb-4 sm:px-5 sm:pb-5 md:col-start-2 md:pl-3">
            <BuildStats :panel="panel" />
          </div>
        </div>

        <p
          v-if="c.gaps.length"
          class="relative flex flex-wrap items-center gap-1.5 border-t border-border-default bg-surface-base/80 px-4 py-2 sm:px-5"
        >
          <Wrench class="size-4 text-warning-text" aria-hidden="true" />
          <span class="sr-only">To do:</span>
          <UiBadge v-for="gap in c.gaps" :key="gap.kind" tone="warning">{{ gap.text }}</UiBadge>
        </p>
      </section>

      <section class="min-w-0" aria-labelledby="detail-artifacts">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 id="detail-artifacts" class="sr-only">Artifacts</h3>
          <SetBonuses v-if="c.sets.length" :sets="c.sets" />
          <span v-else class="text-sm text-text-muted">No artifacts</span>
          <CritValue
            v-if="c.artifactCount"
            :value="c.cv"
            scope="build"
            label
            class="text-sm"
            :detail="`CRIT ${c.critRate}% / ${c.critDmg}% from artifacts`"
          />
        </div>
        <div class="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 md:grid-cols-3">
          <ArtifactPiece
            v-for="(slot, index) in SLOT_ORDER"
            :key="slot"
            :slot-key="slot"
            :piece="c.artifacts[index] ?? null"
          />
        </div>
      </section>

      <!-- The share card, laid out off screen for an export (narrow screens don't show it) -->
      <div
        v-if="offscreen"
        class="pointer-events-none fixed top-0"
        :style="{
          left: `-${CARD_WIDTH * 3}px`,
          width: `${CARD_WIDTH}px`,
          height: `${CARD_HEIGHT}px`,
        }"
        aria-hidden="true"
        inert
      >
        <ShareCard
          ref="card"
          :character="c"
          :panel="panel"
          :talents="talents"
          :theme="cardTheme"
          :owner="owner"
          :taken-at="takenAt"
        />
      </div>
    </template>

    <section aria-labelledby="detail-changes">
      <h3 id="detail-changes" class="mb-3 text-sm font-semibold text-text-secondary">History</h3>
      <UiError
        v-if="history.error.value"
        :error="history.error.value"
        title="Load failed"
        @retry="history.reload"
      />
      <div v-else-if="!history.data.value" class="flex flex-col gap-3" aria-busy="true">
        <UiSkeleton v-for="n in 3" :key="n" class="h-6 w-full max-w-md" />
      </div>
      <p v-else-if="changes.length === 0" class="text-sm text-text-muted">None</p>
      <CharacterTimeline v-else :changes="changes" :reset-key="c.key" />
    </section>
  </div>
</template>
