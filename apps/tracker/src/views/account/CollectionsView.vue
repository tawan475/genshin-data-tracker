<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Info } from 'lucide-vue-next'
import { decodeCollections, type CollectionsSection } from '@gdt/shared'
import SpincrystalsSection from '@/components/collections/SpincrystalsSection.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadBundle, type AccountRef } from '@/data/account-data'
import { loadSpincrystals, spincrystalProgress } from '@/data/spincrystals'
import { useResource } from '@/data/use-resource'
import { loadGameIcons } from '@/lib/assets'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useAccount } from './context'

/**
 * Collections: what the newest capture with Teyvat.me Capture's
 * `gi_collections` says the player has collected, against the game data.
 * Read-only (no hand marks), so viewers of a shared account see the same.
 * Radiant Spincrystals first; later collections become sections below.
 */
const account = useAccount()

const game = useResource(
  () => 0,
  async () => {
    const [spincrystals] = await Promise.all([loadSpincrystals(), loadGameIcons()])
    return { spincrystals }
  },
)

interface Captured {
  /** Item ids, ascending; null when no capture had the list. */
  spincrystals: number[] | null
  takenAt: number | null
}
const NONE: Captured = { spincrystals: null, takenAt: null }

async function loadCaptured(a: AccountRef): Promise<Captured> {
  const bundle = await loadBundle(a, { sections: ['collections'] })
  // Oldest first: the newest snapshot whose collections have the list.
  for (const snapshot of [...bundle.snapshots].reverse()) {
    const text = snapshot.collections ? bundle.texts.get(snapshot.collections) : undefined
    if (text === undefined) continue
    const { spincrystals } = decodeCollections(JSON.parse(text) as CollectionsSection)
    if (spincrystals) return { spincrystals, takenAt: snapshot.takenAt }
  }
  return NONE
}

// Tagged with the account, so a switch shows a skeleton, not the last account's data.
const capture = useResource(
  () => account.value,
  async (a) => ({ accountId: a.id, captured: a.latest ? await loadCaptured(a) : NONE }),
)
const captured = computed(() => {
  const value = capture.data.value
  return value && value.accountId === account.value.id ? value.captured : null
})

const ready = computed(() => !!game.data.value && !!captured.value)
const loadError = computed(() => game.error.value ?? capture.error.value)
function retry() {
  if (game.error.value) void game.reload()
  if (capture.error.value) void capture.reload()
}

const progress = computed(() => {
  const owned = captured.value?.spincrystals
  return game.data.value && owned ? spincrystalProgress(game.data.value.spincrystals, owned) : null
})

const newestCapture = computed(() => {
  const at = captured.value?.takenAt
  return at == null
    ? null
    : { iso: new Date(at).toISOString(), ago: formatRelative(at), title: formatDateTime(at) }
})
</script>

<template>
  <div>
    <PageHeader :title="$t('collections.title')">
      <template v-if="ready" #meta>
        <p v-if="newestCapture" class="flex items-center gap-1.5 text-text-secondary">
          <Clock class="size-4" aria-hidden="true" />
          <span class="sr-only">{{ $t('collections.newestCapture') }}</span>
          <time
            :datetime="newestCapture.iso"
            :title="$t('collections.newestCaptureTitle', { time: newestCapture.title })"
            >{{ newestCapture.ago }}</time
          >
        </p>
        <p
          v-else
          class="flex items-center gap-1.5 text-text-secondary"
          :title="$t('collections.notCapturedTitle')"
        >
          <Info class="size-4 shrink-0" aria-hidden="true" />
          {{ $t('collections.notCaptured') }}
        </p>
      </template>
    </PageHeader>

    <UiError
      v-if="loadError && !ready"
      :title="$t('collections.loadFailed')"
      :error="loadError"
      @retry="retry"
    />

    <SpincrystalsSection v-else-if="ready" :progress="progress" />

    <div v-else aria-busy="true" :aria-label="$t('collections.loading')">
      <div class="mb-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:mb-6">
        <UiSkeleton v-for="n in 2" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <UiSkeleton class="h-96 w-full" />
    </div>
  </div>
</template>
