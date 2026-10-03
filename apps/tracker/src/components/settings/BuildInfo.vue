<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useResource } from '@/data/use-resource'
import { formatDateTime, formatRelative } from '@/lib/format'
import { loadHealth } from './health'

/** What the server says about itself: build, database and schema state. */
const { data: health, error, loading, reload } = useResource(() => true, loadHealth)

const builtAt = computed(() => {
  const iso = health.value?.build?.builtAt
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) ? { ms, iso: iso! } : null
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <h3 class="font-display text-lg font-bold">Server build</h3>
      <UiIconButton label="Check again" @click="reload">
        <RefreshCw class="size-5" :class="loading ? 'animate-spin' : ''" aria-hidden="true" />
      </UiIconButton>
    </div>

    <UiError
      v-if="error && !health"
      class="mt-3"
      :error="error"
      title="Could not read the server status"
      @retry="reload"
    />

    <div v-else-if="!health" class="mt-3 flex flex-col gap-3" aria-busy="true">
      <div v-for="n in 5" :key="n" class="flex items-center justify-between gap-4">
        <UiSkeleton class="h-5 w-24" />
        <UiSkeleton class="h-5 w-32" />
      </div>
    </div>

    <dl
      v-else
      class="mt-1 flex flex-col divide-y divide-border-subtle font-mono text-sm"
      :aria-busy="loading"
    >
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
        <dt class="font-sans text-text-secondary">Status</dt>
        <dd>
          <UiBadge :tone="health.status === 'ok' ? 'success' : 'warning'">{{
            health.status
          }}</UiBadge>
        </dd>
      </div>
      <template v-if="health.build">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <dt class="font-sans text-text-secondary">Version</dt>
          <dd class="tabular">{{ health.build.version }}</dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <dt class="font-sans text-text-secondary">Commit</dt>
          <dd class="flex items-center gap-2">
            <span>{{ health.build.commit }}</span>
            <UiBadge v-if="health.build.dirty" tone="warning">uncommitted changes</UiBadge>
          </dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <dt class="font-sans text-text-secondary">Built</dt>
          <dd v-if="builtAt" class="flex flex-wrap items-baseline justify-end gap-x-2">
            <time class="tabular" :datetime="builtAt.iso" :title="builtAt.iso">{{
              formatDateTime(builtAt.ms)
            }}</time>
            <span class="font-sans text-text-muted">{{ formatRelative(builtAt.ms) }}</span>
          </dd>
          <dd v-else>{{ health.build.builtAt }}</dd>
        </div>
      </template>
      <div v-else class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
        <dt class="font-sans text-text-secondary">Build</dt>
        <dd class="font-sans text-text-muted">No build information</dd>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
        <dt class="font-sans text-text-secondary">Database</dt>
        <dd :class="health.db === 'ok' ? 'text-success-text' : 'text-danger-text'">
          {{ health.db === 'ok' ? 'reachable' : 'unreachable' }}
        </dd>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
        <dt class="font-sans text-text-secondary">Schema</dt>
        <dd class="tabular text-right">
          {{ health.schema.applied }} / {{ health.schema.expected ?? '?' }}
          <span class="font-sans text-text-muted">migrations applied</span>
        </dd>
      </div>
      <div v-if="health.schema.pending.length" class="flex flex-col gap-1 py-2.5">
        <dt class="font-sans text-warning-text">
          {{ health.schema.pending.length }} pending
          {{ health.schema.pending.length === 1 ? 'migration' : 'migrations' }}
        </dt>
        <dd v-for="name in health.schema.pending" :key="name" class="break-all">{{ name }}</dd>
      </div>
    </dl>

    <p v-if="error && health" class="mt-2 text-sm text-danger-text" role="alert">
      Could not refresh: {{ error instanceof Error ? error.message : 'unknown error' }}
    </p>
  </div>
</template>
