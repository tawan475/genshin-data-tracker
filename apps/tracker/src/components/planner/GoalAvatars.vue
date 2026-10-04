<script setup lang="ts">
import { computed } from 'vue'
import { Plus } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { characterName, weaponName } from './model'

/**
 * Who needs something: goal ids (`character:Key`, `weapon:Key:Owner`,
 * `item:Key`) as overlapping portraits, one per character (a weapon goal
 * shows its holder, a spare weapon itself, extra item needs one "+" disc),
 * "+N" past `max`.
 */
const props = withDefaults(defineProps<{ goals: readonly string[]; max?: number }>(), { max: 6 })

const people = computed(() => {
  const byKey = new Map<string, { id: string; src: string; names: string[]; extra?: true }>()
  for (const id of props.goals) {
    const [kind, key = '', owner = ''] = id.split(':')
    if (kind === 'item') {
      byKey.set('extra', { id, src: '', names: ['Extra'], extra: true })
      continue
    }
    // A weapon goal shows the character holding it; a spare one, the weapon.
    const who = kind === 'character' ? key : owner
    const name = kind === 'character' ? characterName(key) : weaponName(key)
    const slot = who ? `c:${who}` : `w:${key}`
    const seen = byKey.get(slot)
    if (seen) {
      seen.names.push(name)
      continue
    }
    byKey.set(slot, {
      id,
      src: who ? characterIcon(who) : weaponIcon(key, 2),
      names: who && kind !== 'character' ? [characterName(who), name] : [name],
    })
  }
  return [...byKey.values()].map((p) => ({
    id: p.id,
    src: p.src,
    extra: p.extra ?? false,
    name: [...new Set(p.names)].join(' · '),
  }))
})
const shown = computed(() => people.value.slice(0, props.max))
const extra = computed(() => people.value.length - shown.value.length)
const names = computed(() => people.value.map((p) => p.name).join(', '))
</script>

<template>
  <span v-if="people.length" class="inline-flex min-w-0 items-center" :title="names">
    <span class="sr-only">{{ names }}</span>
    <span class="flex -space-x-2" aria-hidden="true">
      <template v-for="p in shown" :key="p.id">
        <span
          v-if="p.extra"
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-text-secondary ring-2 ring-surface-raised"
        >
          <Plus class="size-4" />
        </span>
        <GameIcon
          v-else
          :src="p.src"
          :name="p.name"
          size="xs"
          class="rounded-full! ring-2 ring-surface-raised"
        />
      </template>
    </span>
    <span
      v-if="extra > 0"
      class="tabular ml-1 font-mono text-xs text-text-secondary"
      aria-hidden="true"
      >+{{ extra }}</span
    >
  </span>
</template>
