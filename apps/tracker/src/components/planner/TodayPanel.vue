<script setup lang="ts">
import type { ResinNow, TodayPlan } from '@gdt/game-data/planner-estimate'
import { WEEKDAY_LABELS } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { Clock } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { materialIcon } from '@/lib/assets'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import DomainCard from './DomainCard.vue'
import RunBadge from './RunBadge.vue'
import { formatCountdown } from './farm-format'

/**
 * Today on the account's server: the domains open today with what the
 * goals still need (only today's families), their runs, the time to the
 * 04:00 reset and the resin held now (estimated from the newest snapshot:
 * irminsul's count at login when it has one, else the material count).
 */
const props = defineProps<{ today: TodayPlan; resin: ResinNow | null }>()

const resinTitle = computed(() => {
  const r = props.resin
  if (!r) return ''
  const read =
    r.source === 'player'
      ? `${formatNumber(r.atSnapshot)} at login, ${formatDateTime(r.at)}`
      : `${formatNumber(r.atSnapshot)} at the snapshot`
  const parts = [`Original Resin now ~${formatNumber(r.original)}/200 (${read})`]
  if (r.fullAt) parts.push(`full at ${formatTime(r.fullAt)}`)
  if (r.bag > 0) {
    const items = r.items.map((i) => `${formatNumber(i.count)} ${i.key.replace(/Resin$/, '')}`)
    parts.push(`in the bag ${formatNumber(r.bag)} (${items.join(', ')})`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm"
    aria-label="Today"
  >
    <header class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      <span class="font-semibold">Today · {{ WEEKDAY_LABELS[today.weekday] }}</span>
      <span
        class="tabular flex items-center gap-1 font-mono text-text-secondary"
        title="Until the server reset (04:00)"
      >
        <Clock class="size-3.5" aria-hidden="true" />
        {{ formatCountdown(today.msUntilReset) }}
      </span>
      <span
        v-if="resin?.known"
        class="tabular flex items-center gap-1 font-mono text-text-secondary"
        :title="resinTitle"
      >
        <span class="size-5 overflow-hidden rounded">
          <MaterialIcon :src="materialIcon('OriginalResin')" name="Original Resin" />
        </span>
        ~{{ formatNumber(resin.original)
        }}<span v-if="resin.bag" class="text-text-muted">+{{ formatNumber(resin.bag) }}</span>
        <span class="sr-only">{{ resinTitle }}</span>
      </span>
      <span class="ml-auto">
        <RunBadge :run="today.run" :status="today.run ? 'ok' : 'done'" />
      </span>
    </header>
    <p v-if="today.domains.length === 0" class="text-sm text-text-muted">Nothing to farm today</p>
    <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <DomainCard
        v-for="d in today.domains"
        :key="d.domain.id"
        :entry="d.domain.entry"
        :groups="d.groups"
        :run="d.run"
        :status="d.run ? 'ok' : d.domain.status"
        :goals="d.domain.goals"
        :today="today.weekday"
        compact
      />
    </div>
  </section>
</template>
