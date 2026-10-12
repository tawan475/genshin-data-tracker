<script setup lang="ts">
import { computed } from 'vue'
import type { AnecdoteTexts } from '@gdt/game-data'
import { characterInfo } from '@gdt/game-data/catalog'
import { toGoodKey } from '@gdt/game-data/good-key'
import type { NpcGroup } from '@/data/anecdote-progress'
import GameIcon from '@/components/ui/GameIcon.vue'
import { characterIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import AnecdoteRow from './AnecdoteRow.vue'

/**
 * One NPC's anecdotes in an area, under the NPC's portrait and name. The
 * NPC ids (98xx) are not character ids: the portrait is the character whose
 * GOOD key the name makes, when the game data knows one; else initials.
 */
const props = defineProps<{
  group: NpcGroup
  text: AnecdoteTexts
  readOnly: boolean
}>()
defineEmits<{ mark: [id: number]; unmark: [id: number] }>()

const name = computed(() => props.text.npcs.get(props.group.npc) ?? `#${props.group.npc}`)
const portrait = computed(() => {
  const key = toGoodKey(name.value)
  return key && characterInfo(key) ? characterIcon(key) : ''
})
const complete = computed(() => props.group.total > 0 && props.group.done >= props.group.total)
</script>

<template>
  <section
    class="rounded-xl border border-border-default bg-surface-raised shadow-sm"
    :aria-label="name"
  >
    <header class="flex items-center gap-2.5 border-b border-border-default px-3 py-2">
      <GameIcon :src="portrait" :name="name" size="sm" />
      <h3 class="min-w-0 flex-1 truncate font-semibold">{{ name }}</h3>
      <span
        class="tabular font-mono text-sm"
        :class="complete ? 'text-success-text' : 'text-text-secondary'"
        >{{ formatNumber(group.done) }} / {{ formatNumber(group.total) }}</span
      >
    </header>
    <ul class="divide-y divide-border-default">
      <AnecdoteRow
        v-for="entry in group.entries"
        :key="entry.anecdote.id"
        :entry="entry"
        :text="text"
        :read-only="readOnly"
        @mark="$emit('mark', $event)"
        @unmark="$emit('unmark', $event)"
      />
    </ul>
  </section>
</template>
