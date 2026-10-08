<script setup lang="ts">
import { computed } from 'vue'
import { Wrench } from 'lucide-vue-next'
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
import { formatLevel } from '@/lib/level'
import FavoriteStar from './FavoriteStar.vue'
import FriendshipBadge from './FriendshipBadge.vue'
import NamecardBackdrop from './NamecardBackdrop.vue'
import TalentChips from './TalentChips.vue'

/**
 * One character in the roster grid, over its namecard: visual only; the card
 * opens the details. The favourite star sits on the portrait's corner, beside
 * the card's button (a button can't hold another).
 */
const props = defineProps<{ character: CharacterView; favorite?: boolean }>()
defineEmits<{ open: []; favorite: [] }>()

const c = computed(() => props.character)

const label = computed(
  () =>
    `${c.value.name}, ${formatLevel(c.value.level, c.value.ascension)}, C${c.value.constellation}, talents ${c.value.talent.auto} ${c.value.talent.skill} ${c.value.talent.burst}` +
    (c.value.friendship !== null ? `, friendship ${c.value.friendship}` : ''),
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
const weaponTitle = computed(() => {
  const w = c.value.weapon
  return w ? `${w.name} · ${formatLevel(w.level, w.ascension)} · R${w.refinement}` : 'No weapon'
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
      <!-- The namecard under the whole card, the foot included (its bar blurs it);
           lighter and livelier on the light theme. -->
      <NamecardBackdrop
        :src="characterBanner(c.key)"
        lazy
        class="absolute inset-y-0 right-0 h-full w-full opacity-40 brightness-[1.15] saturate-[1.2] [mask-image:linear-gradient(to_left,black_35%,transparent_95%)] sm:w-5/6 dark:opacity-25 dark:brightness-100 dark:saturate-100"
      />
      <div class="relative w-full">
        <div class="relative flex w-full items-start gap-3 p-3">
          <GameIcon
            :src="characterIcon(c.key)"
            :name="c.name"
            :rarity="c.rarity ?? undefined"
            size="lg"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex items-center gap-1.5">
              <ElementIcon v-if="c.element" :element="c.element" size="lg" />
              <p class="min-w-0 flex-1 truncate font-display text-base font-semibold" :title="kind">
                {{ c.name }}
              </p>
              <UiBadge v-if="c.gaps.length" tone="warning" mono class="shrink-0" :title="gapText">
                <Wrench class="size-3.5" aria-hidden="true" />
                {{ c.gaps.length }}
                <span class="sr-only">to do: {{ gapText }}</span>
              </UiBadge>
            </div>
            <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-text-secondary">
              <LevelText
                :level="c.level"
                :ascension="c.ascension"
                :target="TARGET_LEVEL"
                class="text-text-primary"
              />
              <FriendshipBadge v-if="c.friendship !== null" :level="c.friendship" />
            </p>
            <div class="flex items-center justify-between gap-2">
              <ConstellationStars :value="c.constellation" :element="c.element" :label="false" />
              <TalentChips :talent="c.talent" />
            </div>
          </div>
        </div>
      </div>

      <div
        class="relative mt-auto flex w-full items-center gap-2 border-t border-border-subtle/70 bg-surface-raised/70 px-3 py-2 text-sm backdrop-blur-md"
      >
        <span v-if="c.weapon" class="flex shrink-0 items-center gap-1.5" :title="weaponTitle">
          <GameIcon
            :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
            :name="c.weapon.name"
            :rarity="c.weapon.rarity ?? undefined"
            size="xs"
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
            <GameIcon :src="artifactSetIcon(set.setKey)" :name="set.name" size="xs" />
            <span class="tabular font-mono">{{ set.count }}</span>
          </span>
        </span>

        <CritValue
          v-if="c.artifactCount > 0"
          :value="c.cv"
          scope="build"
          label
          class="shrink-0"
          :detail="`CRIT ${c.critRate}% / ${c.critDmg}% from artifacts`"
        />
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
