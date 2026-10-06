<script setup lang="ts">
import { computed, nextTick, useId } from 'vue'
import { useProgressive } from '@/components/planner/use-progressive'
import { RARITY_TEXT } from '@/components/characters/tokens'
import type { RaritySection, WeaponRow } from '@/data/weapons'
import { formatNumber } from '@/lib/format'
import WeaponTile from './WeaponTile.vue'

/**
 * The game's weapon bag: one tile per copy (identical spare copies stacked),
 * in rarity sections with a divider each ("5★ 58"). Above them, the
 * sections as jump chips. Sections off screen skip layout and paint; the
 * tiles mount a screenful first, the rest over the next frames.
 */
const props = defineProps<{ sections: RaritySection[]; selected?: string | null }>()
defineEmits<{ open: [row: WeaponRow] }>()

const uid = useId()
const sectionId = (rarity: number) => `${uid}-r${rarity}`
const rarityLabel = (rarity: number) => (rarity ? `${rarity}★` : '?')
/** Rarity 0: weapons newer than the game data. */
const sectionTitle = (section: RaritySection) =>
  section.rarity ? copies(section.copies) : `${copies(section.copies)} · Not in the game data yet`

// A screenful of tiles first, the rest over the next frames; then sorts and filters patch the
// tiles in place (copies stack, so a few hundred at most). A jump renders everything first.
const total = computed(() => props.sections.reduce((sum, s) => sum + s.rows.length, 0))
const { shown } = useProgressive(total, 64, 64)
const visible = computed(() => {
  let budget = shown.value
  const out: RaritySection[] = []
  for (const section of props.sections) {
    const count = Math.min(section.rows.length, budget)
    budget -= count
    out.push(
      count === section.rows.length ? section : { ...section, rows: section.rows.slice(0, count) },
    )
    if (count < section.rows.length) break
  }
  return out
})

async function jump(rarity: number) {
  shown.value = total.value
  await nextTick()
  document.getElementById(sectionId(rarity))?.scrollIntoView({ block: 'start' })
}

const copies = (n: number) => `${formatNumber(n)} ${n === 1 ? 'copy' : 'copies'}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <nav
      v-if="sections.length > 1"
      class="scroll-hide scroll-fade-x -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
      aria-label="Rarity"
    >
      <button
        v-for="section in sections"
        :key="section.rarity"
        type="button"
        class="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-surface-raised px-3 text-sm font-medium transition-colors hover:bg-surface-overlay"
        :title="sectionTitle(section)"
        @click="jump(section.rarity)"
      >
        <span :class="RARITY_TEXT[section.rarity] ?? 'text-text-muted'">{{
          rarityLabel(section.rarity)
        }}</span>
        <span class="tabular font-mono text-text-muted">{{ formatNumber(section.copies) }}</span>
      </button>
    </nav>

    <section
      v-for="section in visible"
      :id="sectionId(section.rarity)"
      :key="section.rarity"
      class="scroll-mt-20 [contain-intrinsic-size:auto_24rem] [content-visibility:auto]"
      :aria-labelledby="`${sectionId(section.rarity)}-h`"
    >
      <h2
        :id="`${sectionId(section.rarity)}-h`"
        class="mb-2 flex items-center gap-2 text-sm font-medium"
        :title="sectionTitle(section)"
      >
        <span :class="RARITY_TEXT[section.rarity] ?? 'text-text-muted'">{{
          rarityLabel(section.rarity)
        }}</span>
        <span class="tabular font-mono text-text-muted">{{ formatNumber(section.copies) }}</span>
        <span class="h-px flex-1 bg-border-default" aria-hidden="true" />
      </h2>
      <ul
        class="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2"
      >
        <li v-for="row in section.rows" :key="row.id" class="flex">
          <WeaponTile :row="row" :selected="row.id === selected" @open="$emit('open', row)" />
        </li>
      </ul>
    </section>
  </div>
</template>
