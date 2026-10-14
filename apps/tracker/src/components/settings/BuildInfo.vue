<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { useResource } from '@/data/use-resource'
import { errorText } from '@/i18n/api-errors'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
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
      <h3 class="font-display text-lg font-bold">{{ $t('settings.build.title') }}</h3>
      <UiIconButton :label="$t('settings.build.checkAgain')" @click="reload">
        <RefreshCw class="size-5" :class="loading ? 'animate-spin' : ''" aria-hidden="true" />
      </UiIconButton>
    </div>

    <UiError
      v-if="error && !health"
      class="mt-3"
      :error="error"
      :title="$t('settings.build.couldNotRead')"
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
        <dt class="font-sans text-text-secondary">{{ $t('settings.build.status') }}</dt>
        <dd>
          <UiBadge :tone="health.status === 'ok' ? 'success' : 'warning'">{{
            health.status
          }}</UiBadge>
        </dd>
      </div>
      <template v-if="health.build">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <dt class="font-sans text-text-secondary">{{ $t('settings.build.version') }}</dt>
          <dd class="tabular">{{ health.build.version }}</dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <dt class="font-sans text-text-secondary">{{ $t('settings.build.commit') }}</dt>
          <dd class="flex items-center gap-2">
            <span>{{ health.build.commit }}</span>
            <UiBadge v-if="health.build.dirty" tone="warning">{{
              $t('settings.build.uncommitted')
            }}</UiBadge>
          </dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <dt class="font-sans text-text-secondary">{{ $t('settings.build.built') }}</dt>
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
        <dt class="font-sans text-text-secondary">{{ $t('settings.build.build') }}</dt>
        <dd class="font-sans text-text-muted">{{ $t('settings.build.noBuild') }}</dd>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
        <dt class="font-sans text-text-secondary">{{ $t('settings.build.database') }}</dt>
        <dd :class="health.db === 'ok' ? 'text-success-text' : 'text-danger-text'">
          {{
            health.db === 'ok' ? $t('settings.build.reachable') : $t('settings.build.unreachable')
          }}
        </dd>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
        <dt class="font-sans text-text-secondary">{{ $t('settings.build.schema') }}</dt>
        <dd class="tabular text-right">
          {{ health.schema.applied }} / {{ health.schema.expected ?? '?' }}
          <span class="font-sans text-text-muted">{{
            $t('settings.build.migrationsApplied')
          }}</span>
        </dd>
      </div>
      <div v-if="health.schema.pending.length" class="flex flex-col gap-1 py-2.5">
        <dt class="font-sans text-warning-text">
          {{
            $t(
              'settings.build.pending',
              { n: formatNumber(health.schema.pending.length) },
              health.schema.pending.length,
            )
          }}
        </dt>
        <dd v-for="name in health.schema.pending" :key="name" class="break-all">{{ name }}</dd>
      </div>
    </dl>

    <p v-if="error && health" class="mt-2 text-sm text-danger-text" role="alert">
      {{
        $t('settings.build.couldNotRefresh', {
          error: error instanceof Error ? errorText(error) : $t('common.unknownError'),
        })
      }}
    </p>
  </div>
</template>
