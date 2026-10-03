<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import { ELEMENT_LABELS, WEAPON_TYPE_LABELS, type CharacterView } from '@/data/characters'
import { artifactSetIcon, characterIcon, weaponIcon } from '@/lib/assets'
import ConstellationPips from './ConstellationPips.vue'

/** One character in the roster grid: visual only; the card opens the details. */
const props = defineProps<{ character: CharacterView }>()
defineEmits<{ open: [] }>()

const c = computed(() => props.character)

const label = computed(
  () =>
    `${c.value.name}, level ${c.value.level}, C${c.value.constellation}, talents ${c.value.talent.auto} ${c.value.talent.skill} ${c.value.talent.burst}`,
)
const kind = computed(() =>
  [
    c.value.element ? ELEMENT_LABELS[c.value.element] : null,
    c.value.weaponType ? WEAPON_TYPE_LABELS[c.value.weaponType] : null,
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <button
    type="button"
    aria-haspopup="dialog"
    :aria-label="label"
    class="flex w-full flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-overlay"
    @click="$emit('open')"
  >
    <div class="flex w-full items-center gap-3">
      <GameIcon
        :src="characterIcon(c.key)"
        :name="c.name"
        :rarity="c.rarity ?? undefined"
        size="lg"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="truncate font-display text-lg font-bold" :title="kind || undefined">
          {{ c.name }}
        </p>
        <p class="tabular flex items-center justify-between gap-2 font-mono text-sm">
          <span :title="`Ascension ${c.ascension}`">Lv {{ c.level }}</span>
          <span
            class="flex gap-2 text-text-secondary"
            :title="`Attack ${c.talent.auto} · Skill ${c.talent.skill} · Burst ${c.talent.burst}`"
          >
            <span>{{ c.talent.auto }}</span>
            <span>{{ c.talent.skill }}</span>
            <span>{{ c.talent.burst }}</span>
          </span>
        </p>
        <ConstellationPips :value="c.constellation" :element="c.element" />
      </div>
    </div>

    <div class="flex w-full items-center gap-3 border-t border-border-subtle pt-3 text-sm">
      <span
        v-if="c.weapon"
        class="flex shrink-0 items-center gap-1.5"
        :title="`${c.weapon.name} · Lv ${c.weapon.level} · R${c.weapon.refinement}`"
      >
        <GameIcon
          :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
          :name="c.weapon.name"
          :rarity="c.weapon.rarity ?? undefined"
          size="sm"
        />
        <span class="tabular font-mono">R{{ c.weapon.refinement }}</span>
      </span>
      <span v-else class="size-9 shrink-0 rounded-lg bg-surface-sunken" title="No weapon" />

      <span class="flex min-w-0 flex-1 items-center gap-2">
        <span
          v-for="set in c.activeSets.slice(0, 2)"
          :key="set.setKey"
          class="flex shrink-0 items-center gap-1"
          :title="`${set.name} ×${set.count}`"
        >
          <GameIcon :src="artifactSetIcon(set.setKey)" :name="set.name" size="sm" />
          <span class="tabular font-mono">{{ set.count }}</span>
        </span>
      </span>

      <span
        v-if="c.artifactCount > 0"
        class="tabular shrink-0 font-mono text-text-secondary"
        title="Crit value"
      >
        CV {{ c.cv.toFixed(1) }}
      </span>
    </div>
  </button>
</template>
