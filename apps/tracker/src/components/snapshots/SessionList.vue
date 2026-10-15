<script setup lang="ts">
import type { LiveJournalResponse, SnapshotResponse } from '@gdt/shared'
import { computed, ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { AccountRef } from '@/data/account-data'
import { buildSessions } from '@/data/sessions'
import SessionCard from './SessionCard.vue'

/**
 * Recent play sessions (live sync): only sessions irminsul named (snapshots
 * with `gi_capture`); older snapshots stay in the list as they are.
 */
const props = defineProps<{
  snapshots: readonly SnapshotResponse[]
  live: LiveJournalResponse | null | undefined
  account: AccountRef & { latest: { id: number } | null }
  /** Sessions shown at first; "Show more" adds as many again. */
  limit: number
  /** The heading and "Show more" (the Snapshots page; Overview shows the newest card only). */
  full?: boolean
}>()

const shown = ref(props.limit)
// A session of one snapshot and nothing since (a login, then nothing) says nothing.
const sessions = computed(() =>
  buildSessions(props.snapshots, props.live).filter(
    (session) => !session.byDay && (session.snapshots.length > 1 || session.live),
  ),
)
</script>

<template>
  <section v-if="sessions.length" class="min-w-0 space-y-3">
    <h2 v-if="full" class="text-xl font-bold">{{ $t('live.session.heading') }}</h2>
    <SessionCard
      v-for="session in sessions.slice(0, shown)"
      :key="session.key"
      :session="session"
      :account="account"
    />
    <UiButton
      v-if="full && sessions.length > shown"
      variant="ghost"
      size="sm"
      @click="shown += limit"
    >
      {{ $t('live.session.showMore', { n: sessions.length - shown }) }}
    </UiButton>
  </section>
</template>
