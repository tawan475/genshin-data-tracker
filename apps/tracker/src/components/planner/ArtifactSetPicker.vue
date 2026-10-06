<script setup lang="ts">
import type { FarmingData } from '@gdt/game-data/farming'
import images from '@gdt/game-data/data/images.json'
import { computed, ref } from 'vue'
import { Check, Search } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiInput from '@/components/ui/UiInput.vue'
import { normalizeSearch } from '@/data/characters'
import { artifactSetIcon } from '@/lib/assets'
import { formatSetName } from '@/utils/artifact-stats'
import { domainsForSet, setPickerOrder } from './artifact-domains'

/**
 * Picks an artifact set: the ones the character wears first, then the 5★
 * sets of the domains (newest first), then the rest by name; each with
 * the domain that drops it. Sets already chosen are marked.
 */
const props = defineProps<{
  farming: FarmingData | null
  /** Sets already in the goal. */
  chosen: readonly string[]
  /** Sets the character wears now (offered first). */
  worn: readonly string[]
}>()
const emit = defineEmits<{ pick: [key: string] }>()
const query = ref('')

const ALL = Object.keys((images as { artifacts: Record<string, unknown> }).artifacts)

const rows = computed(() => {
  const words = normalizeSearch(query.value).split(' ').filter(Boolean)
  return setPickerOrder(props.farming, ALL, formatSetName, props.worn)
    .map((key) => ({
      key,
      name: formatSetName(key),
      domain: domainsForSet(props.farming, key)[0]?.name ?? '',
    }))
    .filter((r) => words.every((w) => normalizeSearch(`${r.name} ${r.domain}`).includes(w)))
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <label class="relative">
      <span class="sr-only">Search sets</span>
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <UiInput v-model="query" class="pl-9" placeholder="Search" type="search" />
    </label>
    <ul class="flex max-h-72 flex-col gap-0.5 overflow-y-auto" aria-label="Artifact sets">
      <li v-for="row in rows" :key="row.key">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-overlay"
          :aria-pressed="chosen.includes(row.key)"
          :title="row.domain ? `${row.name} · ${row.domain}` : row.name"
          @click="emit('pick', row.key)"
        >
          <GameIcon :src="artifactSetIcon(row.key)" :name="row.name" :rarity="5" size="sm" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm">{{ row.name }}</span>
            <span v-if="row.domain" class="truncate text-xs text-text-muted">{{ row.domain }}</span>
          </span>
          <Check
            v-if="chosen.includes(row.key)"
            class="size-4 shrink-0 text-accent-text"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
