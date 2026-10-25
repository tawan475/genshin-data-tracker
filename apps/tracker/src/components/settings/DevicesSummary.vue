<script setup lang="ts">
import type { SessionResponse } from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import ProviderMark from '@/components/oauth/ProviderMark.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { api } from '@/api'
import { formatRelative } from '@/lib/format'
import { METHOD_ICONS, byRecent, deviceName, devicePlace, methodTitle } from './devices'

/** Settings: the three most recent devices; the full list is its own page. */
const SHOWN = 3
const sessions = ref<SessionResponse[] | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    sessions.value = await api.sessions()
  } catch {
    failed.value = true
  }
})

const rows = computed(() =>
  [...(sessions.value ?? [])]
    .sort(byRecent)
    .slice(0, SHOWN)
    .map((row) => ({ ...row, device: deviceName(row), place: devicePlace(row) })),
)
</script>

<template>
  <UiPanel :title="$t('settings.devices.title')">
    <template #actions>
      <UiButton size="sm" :to="{ name: 'settings-devices' }">
        {{
          sessions ? $t('settings.devices.all', { n: sessions.length }) : $t('shell.page.devices')
        }}
        <ChevronRight class="size-4" aria-hidden="true" />
      </UiButton>
    </template>
    <ul v-if="sessions" class="flex flex-col divide-y divide-border-subtle">
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <span class="shrink-0 text-text-muted" :title="methodTitle(row.method)">
          <ProviderMark
            v-if="row.method === 'discord' || row.method === 'google'"
            :provider="row.method"
            class="size-4"
          />
          <component :is="METHOD_ICONS[row.method]" v-else class="size-4" aria-hidden="true" />
          <span class="sr-only">{{ methodTitle(row.method) }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex min-w-0 items-center gap-2">
            <span class="truncate font-medium">{{ row.device }}</span>
            <UiBadge v-if="row.current" tone="accent">{{
              $t('settings.devices.thisDevice')
            }}</UiBadge>
          </p>
          <p class="truncate text-sm text-text-muted">
            <span class="tabular">{{ row.place || $t('settings.devices.unknownPlace') }}</span>
            <template v-if="!row.current"> · {{ formatRelative(row.lastSeenAt) }}</template>
          </p>
        </div>
      </li>
    </ul>
    <p v-else-if="failed" class="text-sm text-text-muted">{{ $t('settings.devices.notLoaded') }}</p>
    <div v-else class="flex flex-col gap-3" aria-busy="true">
      <UiSkeleton v-for="n in SHOWN" :key="n" class="h-10 w-full" />
    </div>
  </UiPanel>
</template>
