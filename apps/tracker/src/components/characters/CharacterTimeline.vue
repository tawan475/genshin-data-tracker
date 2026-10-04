<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import type { CharacterChange } from '@/data/characters-history'
import { formatDate, formatDateTime } from '@/lib/format'

/** A character's progression, newest first, as a dotted vertical timeline. */
const props = defineProps<{ changes: CharacterChange[]; resetKey: string }>()

const PREVIEW = 6
const showAll = ref(false)
watch(
  () => props.resetKey,
  () => (showAll.value = false),
)
const shown = computed(() => (showAll.value ? props.changes : props.changes.slice(0, PREVIEW)))
</script>

<template>
  <div class="flex flex-col gap-2">
    <ol class="relative flex flex-col">
      <li
        v-for="(change, index) in shown"
        :key="`${change.at}-${index}`"
        class="relative flex gap-3 pb-4 pl-6 last:pb-0 sm:gap-4"
      >
        <span
          v-if="index < shown.length - 1"
          class="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-border-default"
          aria-hidden="true"
        />
        <span
          class="absolute top-1.5 left-0 size-2.5 rounded-full ring-4 ring-surface-raised"
          :class="change.kind === 'changed' ? 'bg-accent' : 'bg-text-muted'"
          aria-hidden="true"
        />
        <time
          class="w-24 shrink-0 text-sm text-text-secondary sm:w-28"
          :datetime="new Date(change.at).toISOString()"
          :title="formatDateTime(change.at)"
          >{{ formatDate(change.at) }}</time
        >
        <div class="min-w-0 flex-1">
          <p v-if="change.kind !== 'changed'" class="flex flex-wrap gap-x-2 text-sm">
            <span class="text-text-secondary">{{
              change.kind === 'first' ? 'First seen' : 'Obtained'
            }}</span>
            <span class="tabular font-mono">{{ change.state }}</span>
          </p>
          <ul v-else class="flex flex-wrap gap-1.5">
            <li
              v-for="line in change.lines"
              :key="line.label"
              class="inline-flex items-center gap-1.5 rounded-md bg-surface-overlay px-2 py-0.5 text-sm"
            >
              <span class="text-text-secondary">{{ line.label }}</span>
              <span class="tabular font-mono text-text-secondary">{{ line.from }}</span>
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true" />
              <span class="sr-only">to</span>
              <span class="tabular font-mono font-medium">{{ line.to }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ol>
    <div v-if="changes.length > PREVIEW">
      <UiButton variant="ghost" size="sm" @click="showAll = !showAll">
        {{ showAll ? 'Less' : `All ${changes.length}` }}
      </UiButton>
    </div>
  </div>
</template>
