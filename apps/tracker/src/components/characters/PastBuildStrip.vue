<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, History } from 'lucide-vue-next'
import type { GiCapture } from '@gdt/shared'
import UiButton from '@/components/ui/UiButton.vue'
import { t } from '@/i18n'
import { captureLabel } from '@/data/character-gear'
import { SLOT_LABELS, type SlotKey } from '@/data/characters'
import { formatDate, formatFullDateTime, formatTime } from '@/lib/format'

/**
 * Over the character's details while a past build is open: when it was
 * captured and why, what differs from now, Older / Newer through the
 * character's history and Back to now.
 */
const props = defineProps<{
  at: number
  capture: GiCapture | null
  diff: (SlotKey | 'weapon')[]
  older: boolean
  newer: boolean
}>()
defineEmits<{ older: []; newer: []; now: [] }>()

const reason = computed(() => captureLabel(props.capture))
const parts = computed(() =>
  props.diff.map((part) => (part === 'weapon' ? t('game.weapon') : SLOT_LABELS[part])),
)
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent/45 bg-accent/10 px-3 py-2"
    role="status"
  >
    <History class="size-5 shrink-0 text-accent-text" aria-hidden="true" />
    <div class="flex min-w-0 flex-col">
      <span class="text-sm font-semibold" :title="formatFullDateTime(at)">
        {{ $t('characters.builds.buildOf', { date: formatDate(at) }) }} ·
        <span class="tabular">{{ formatTime(at) }}</span>
      </span>
      <span v-if="reason" class="text-xs text-accent-text">{{ reason }}</span>
    </div>
    <p class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
      <template v-if="parts.length">
        <span class="text-text-secondary">{{ $t('characters.builds.differs') }}</span>
        <span
          v-for="part in parts"
          :key="part"
          class="rounded-full bg-accent/20 px-2 py-0.5 text-accent-text"
          >{{ part }}</span
        >
      </template>
      <span v-else class="text-text-secondary">{{ $t('characters.builds.sameAsNow') }}</span>
    </p>
    <div class="ml-auto flex items-center gap-1.5">
      <UiButton size="sm" variant="ghost" :disabled="!older" @click="$emit('older')">
        <ChevronLeft class="size-4" aria-hidden="true" />
        {{ $t('characters.builds.older') }}
      </UiButton>
      <UiButton size="sm" variant="ghost" :disabled="!newer" @click="$emit('newer')">
        {{ $t('characters.builds.newer') }}
        <ChevronRight class="size-4" aria-hidden="true" />
      </UiButton>
      <UiButton size="sm" variant="primary" @click="$emit('now')">
        {{ $t('characters.builds.backToNow') }}
      </UiButton>
    </div>
  </div>
</template>
