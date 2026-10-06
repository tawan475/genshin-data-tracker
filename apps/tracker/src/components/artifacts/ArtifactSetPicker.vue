<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SearchX } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import type { SetOption } from '@/data/artifacts'
import { artifactSetIcon, characterIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * Multi-select in a dialog (fits 60 sets on a phone): artifact sets by
 * default, or with `characters` the wearers ("Equipped by"). Changes apply
 * as they are ticked; counts follow the other filters.
 */
const props = withDefaults(
  defineProps<{ open: boolean; options: SetOption[]; title?: string; characters?: boolean }>(),
  { title: 'Sets' },
)
const emit = defineEmits<{ close: [] }>()
const selected = defineModel<string[]>({ required: true })

const query = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)

const chosen = computed(() => new Set(selected.value))
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? props.options.filter(
        (o) => o.name.toLowerCase().includes(q) || o.key.toLowerCase().includes(q),
      )
    : props.options
  // Most matches first. Ticking a set never changes the set counts (they
  // leave the set filter out), so the list holds still while you tick.
  return [...list].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

function toggle(key: string, on: boolean) {
  selected.value = on ? [...selected.value, key] : selected.value.filter((k) => k !== key)
}
</script>

<template>
  <UiModal :open="open" :title="title" @close="emit('close')">
    <div class="flex flex-col gap-3">
      <label class="block">
        <span class="sr-only">Find</span>
        <UiInput v-model="query" type="search" autocomplete="off" placeholder="Search" />
      </label>

      <ul v-if="shown.length" class="-mx-2 flex flex-col">
        <li v-for="option in shown" :key="option.key">
          <label
            class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-surface-overlay"
            :class="option.count === 0 && !chosen.has(option.key) ? 'text-text-muted' : ''"
          >
            <input
              type="checkbox"
              class="size-4 shrink-0 accent-accent"
              :checked="chosen.has(option.key)"
              @change="toggle(option.key, ($event.target as HTMLInputElement).checked)"
            />
            <GameIcon
              :src="characters ? characterIcon(option.key) : artifactSetIcon(option.key)"
              :name="option.name"
              size="sm"
              :class="characters ? 'rounded-full!' : ''"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">{{ option.name }}</span>
            <span class="tabular font-mono text-sm text-text-muted">
              {{ formatNumber(option.count) }}
            </span>
          </label>
        </li>
      </ul>
      <p v-else class="flex items-center gap-2 py-6 text-text-secondary">
        <SearchX class="size-5 text-text-muted" aria-hidden="true" />
        No match
      </p>
    </div>

    <template #footer>
      <UiButton variant="ghost" :disabled="selected.length === 0" @click="selected = []">
        Clear
      </UiButton>
      <UiButton variant="primary" @click="emit('close')">Done</UiButton>
    </template>
  </UiModal>
</template>
