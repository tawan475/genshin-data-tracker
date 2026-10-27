<script setup lang="ts">
import { computed, type Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import UiProgress from '@/components/ui/UiProgress.vue'
import type { CollectionFigure } from '@/data/collection-summary'
import { formatNumber, formatRelative, formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

/**
 * One card of the Collections hub: the collection's name, its figure (have
 * of total, or a count with its label) and when it was captured. Opens the
 * collection's page.
 */
const props = defineProps<{
  to: RouteLocationRaw
  title: string
  icon: Component
  /** Undefined: the card has no figure (Achievements, Anecdotes count on their page). */
  figure?: CollectionFigure | null
  countLabel?: string
  takenAt?: number | null
}>()

const percent = computed(() =>
  props.figure && 'total' in props.figure && props.figure.total > 0
    ? Math.floor((props.figure.have / props.figure.total) * 100)
    : null,
)
const time = computed(() =>
  props.takenAt == null
    ? null
    : { ago: formatRelative(props.takenAt), title: formatDateTime(props.takenAt) },
)
</script>

<template>
  <RouterLink
    :to="to"
    class="group flex min-h-32 min-w-0 flex-col gap-2.5 rounded-xl border border-border-default bg-surface-raised p-3 sm:min-h-36 sm:gap-3 sm:p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-overlay focus-visible:outline-2 focus-visible:outline-accent"
  >
    <!-- Phones: the title under the icon row, so a long name keeps the card's whole width. -->
    <span class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <span
        class="grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 bg-accent/15 text-accent-text"
      >
        <component :is="icon" class="size-5" aria-hidden="true" />
      </span>
      <span
        class="order-last line-clamp-2 min-w-0 basis-full font-semibold leading-snug break-words sm:order-none sm:flex-1 sm:basis-0"
        >{{ title }}</span
      >
      <ChevronRight
        class="ml-auto size-5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 sm:ml-0"
        aria-hidden="true"
      />
    </span>

    <span v-if="figure && 'total' in figure" class="mt-auto flex flex-col gap-1.5">
      <span class="flex flex-wrap items-baseline justify-between gap-x-2">
        <span class="text-lg font-semibold tabular-nums sm:text-xl"
          >{{ formatNumber(figure.have)
          }}<span class="text-sm font-normal text-text-muted">
            / {{ formatNumber(figure.total) }}</span
          ></span
        >
        <span class="text-sm text-text-secondary tabular-nums">{{ percent }}%</span>
      </span>
      <UiProgress :value="figure.have" :max="figure.total" :label="title" />
    </span>
    <span v-else-if="figure && 'count' in figure" class="mt-auto flex items-baseline gap-2">
      <span class="text-lg font-semibold tabular-nums sm:text-xl">{{
        formatNumber(figure.count)
      }}</span>
      <span class="truncate text-sm text-text-secondary">{{ countLabel }}</span>
    </span>
    <span v-else class="mt-auto" />

    <span
      v-if="figure !== undefined"
      class="truncate text-xs text-text-muted"
      :title="
        time
          ? t('collections.newestCaptureTitle', { time: time.title })
          : t('collections.notCapturedTitle')
      "
      >{{ time ? time.ago : t('collections.notCaptured') }}</span
    >
  </RouterLink>
</template>
