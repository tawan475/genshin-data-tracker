<script setup lang="ts">
import { computed } from 'vue'
import { Wrench } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import {
  ELEMENT_LABELS,
  TARGET_LEVEL,
  WEAPON_TYPE_LABELS,
  type CharacterView,
} from '@/data/characters'
import { artifactSetIcon, characterIcon, weaponIcon } from '@/lib/assets'
import ConstellationPips from './ConstellationPips.vue'
import FriendshipBadge from './FriendshipBadge.vue'
import SlotPips from './SlotPips.vue'
import TalentChips from './TalentChips.vue'
import { ELEMENT_FILL } from './tokens'

/** One character in the roster grid: visual only; the card opens the details. */
const props = defineProps<{ character: CharacterView }>()
defineEmits<{ open: [] }>()

const c = computed(() => props.character)

const label = computed(
  () =>
    `${c.value.name}, level ${c.value.level}, C${c.value.constellation}, talents ${c.value.talent.auto} ${c.value.talent.skill} ${c.value.talent.burst}` +
    (c.value.friendship !== null ? `, friendship ${c.value.friendship}` : ''),
)
const kind = computed(() =>
  [
    c.value.element ? ELEMENT_LABELS[c.value.element] : null,
    c.value.weaponType ? WEAPON_TYPE_LABELS[c.value.weaponType] : null,
    `A${c.value.ascension}`,
  ]
    .filter(Boolean)
    .join(' · '),
)
const gapText = computed(() => c.value.gaps.map((g) => g.text).join(' · '))
const weaponTitle = computed(() => {
  const w = c.value.weapon
  return w ? `${w.name} · Lv ${w.level} · R${w.refinement}` : 'No weapon'
})
</script>

<template>
  <button
    type="button"
    aria-haspopup="dialog"
    :aria-label="label"
    class="group flex w-full flex-col rounded-xl border border-border-default bg-surface-raised text-left shadow-sm transition-colors hover:border-border-strong"
    @click="$emit('open')"
  >
    <div class="flex w-full items-start gap-3 p-3">
      <GameIcon
        :src="characterIcon(c.key)"
        :name="c.name"
        :rarity="c.rarity ?? undefined"
        size="lg"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <span
            v-if="c.element"
            class="size-2.5 shrink-0 rounded-full"
            :class="ELEMENT_FILL[c.element]"
            aria-hidden="true"
          />
          <p class="min-w-0 flex-1 truncate font-display text-base font-semibold" :title="kind">
            {{ c.name }}
          </p>
          <span
            v-if="c.gaps.length"
            class="tabular inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-mono text-xs font-medium text-warning-text"
            :title="gapText"
          >
            <Wrench class="size-3.5" aria-hidden="true" />
            {{ c.gaps.length }}
            <span class="sr-only">to do: {{ gapText }}</span>
          </span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-2.5 text-sm">
            <span
              class="tabular font-mono"
              :class="c.level < TARGET_LEVEL ? 'text-warning-text' : 'text-text-secondary'"
              :title="`Level ${c.level} · Ascension ${c.ascension}`"
              >Lv {{ c.level }}</span
            >
            <FriendshipBadge
              v-if="c.friendship !== null"
              :level="c.friendship"
              class="text-text-secondary"
            />
          </span>
          <ConstellationPips :value="c.constellation" :element="c.element" />
        </div>
        <TalentChips :talent="c.talent" />
      </div>
    </div>

    <div
      class="mt-auto flex w-full items-center gap-2 border-t border-border-subtle px-3 py-2 text-sm"
    >
      <span v-if="c.weapon" class="flex shrink-0 items-center gap-1.5" :title="weaponTitle">
        <GameIcon
          :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
          :name="c.weapon.name"
          :rarity="c.weapon.rarity ?? undefined"
          size="xs"
        />
        <span class="tabular font-mono">R{{ c.weapon.refinement }}</span>
        <span v-if="c.weapon.level < TARGET_LEVEL" class="tabular font-mono text-warning-text"
          >Lv {{ c.weapon.level }}</span
        >
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
        <SlotPips v-if="c.artifactCount < 5" :count="c.artifactCount" />
      </span>

      <span
        v-if="c.artifactCount > 0"
        class="tabular shrink-0 font-mono text-text-secondary"
        :title="`Crit value · CRIT ${c.critRate}% / ${c.critDmg}% from artifacts`"
      >
        CV <span class="text-text-primary">{{ c.cv.toFixed(1) }}</span>
      </span>
    </div>
  </button>
</template>
