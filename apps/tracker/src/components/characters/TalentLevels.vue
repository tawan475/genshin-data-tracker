<script setup lang="ts">
import { computed } from 'vue'
import { Crown } from 'lucide-vue-next'
import { talentTitle, type TalentLevel } from '@/data/character-build'
import type { Element } from '@/data/game-meta'
import TalentGlyph from './TalentGlyph.vue'
import { talentIcons } from './talent-icons'
import { ELEMENT_SOFT, ELEMENT_TEXT } from './tokens'

/**
 * Attack, skill and burst as three tiles: the talent's icon and name, its
 * level as the game shows it and, raised by C3 / C5, the book level before
 * it ("10 → 13", Enka's way). A crowned talent (base 10) is gold.
 */
const props = defineProps<{
  characterKey: string
  levels: TalentLevel[]
  element: Element | null
}>()

const LABELS = { auto: 'Attack', skill: 'Skill', burst: 'Burst' } as const

const glyphs = computed(() => talentIcons(props.characterKey))
const tone = computed(() =>
  props.element
    ? `${ELEMENT_SOFT[props.element]} ${ELEMENT_TEXT[props.element]}`
    : 'bg-surface-overlay text-text-secondary',
)
</script>

<template>
  <dl class="grid grid-cols-3 gap-2">
    <div
      v-for="t in levels"
      :key="t.key"
      class="flex min-w-0 flex-col gap-1 rounded-xl border bg-surface-raised/85 px-2 py-1.5 sm:px-2.5 sm:py-2"
      :class="t.crowned ? 'border-rarity-5/60' : 'border-border-default'"
      :title="talentTitle(t)"
    >
      <dt class="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
        <span
          v-if="glyphs[t.key]"
          class="hidden size-5 shrink-0 items-center justify-center rounded-full min-[400px]:inline-flex"
          :class="tone"
        >
          <TalentGlyph :src="glyphs[t.key]" class="size-4" />
        </span>
        <span class="truncate">{{ LABELS[t.key] }}</span>
      </dt>
      <dd
        class="tabular flex items-baseline gap-0.5 font-mono leading-tight whitespace-nowrap sm:gap-1"
      >
        <span v-if="t.from" class="text-xs text-text-muted"
          >{{ t.base }}<span aria-hidden="true"> →</span
          ><span class="sr-only"> raised to</span></span
        >
        <span
          class="text-xl font-semibold"
          :class="t.from ? 'text-accent-text' : t.crowned ? 'text-rarity-5' : ''"
          >{{ t.level }}</span
        >
        <Crown
          v-if="t.crowned"
          class="size-3.5 shrink-0 self-center text-rarity-5 sm:size-4"
          aria-label="Crowned"
        />
      </dd>
    </div>
  </dl>
</template>
