<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'
import UiStat from '@/components/ui/UiStat.vue'
import PreviewArtifact from './PreviewArtifact.vue'

/**
 * The landing page's product visual: a static composition of real UI pieces
 * (stat tiles, an artifact card, a snapshot list) with plausible numbers. It
 * is one image to assistive tech; the label says what it shows.
 *
 * Layout follows the preview's own width (container queries), so it reads
 * the same in a narrow column and full width.
 */
const snapshots = [
  {
    when: 'Today 21:14',
    source: 'Irminsul',
    artifacts: '2,431',
    uploaded: '812 KB',
    stored: '1.2 KB',
  },
  {
    when: 'Yesterday 19:02',
    source: 'Irminsul',
    artifacts: '2,419',
    uploaded: '809 KB',
    stored: '0.9 KB',
  },
  {
    when: 'Oct 1 22:40',
    source: 'GOOD file',
    artifacts: '2,407',
    uploaded: '806 KB',
    stored: '1.1 KB',
  },
  {
    when: 'Sep 30 20:11',
    source: 'Irminsul',
    artifacts: '2,402',
    uploaded: '805 KB',
    stored: '0.8 KB',
  },
  {
    when: 'Sep 29 23:05',
    source: 'Irminsul',
    artifacts: '2,396',
    uploaded: '803 KB',
    stored: '1.0 KB',
  },
]
</script>

<template>
  <div
    class="@container rounded-2xl border border-border-default bg-surface-nav"
    role="img"
    aria-label="Preview of the tracker: an account's latest totals, an artifact with its crit value, roll value and roll quality, and recent snapshots with their stored sizes."
  >
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3"
    >
      <div class="min-w-0">
        <p class="font-display text-lg font-bold">Main</p>
        <p class="tabular font-mono text-sm text-accent-text">UID 812345678</p>
      </div>
      <UiBadge>Latest: today 21:14</UiBadge>
    </div>

    <div class="flex flex-col gap-3 p-3 @md:p-4">
      <div class="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <UiStat label="Artifacts" :value="2431" :delta="12" />
        <UiStat label="Characters" :value="94" :delta="1" />
        <UiStat label="Weapons" :value="1047" :delta="3" />
        <UiStat label="Mora" :value="72164464" :delta="-1830000" />
      </div>

      <div class="grid gap-3 @2xl:grid-cols-2">
        <PreviewArtifact />

        <section class="flex flex-col rounded-xl border border-border-default bg-surface-raised">
          <div class="flex items-baseline justify-between gap-3 border-b border-border-subtle p-4">
            <span class="font-display font-bold">Snapshots</span>
            <span class="tabular font-mono text-sm text-text-muted">185 kept</span>
          </div>
          <ul class="flex flex-1 flex-col divide-y divide-border-subtle">
            <li
              v-for="snapshot in snapshots"
              :key="snapshot.when"
              class="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="tabular truncate font-mono">{{ snapshot.when }}</p>
                <p class="truncate text-sm text-text-muted">
                  {{ snapshot.source }} ·
                  <span class="tabular font-mono">{{ snapshot.artifacts }}</span> artifacts
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="tabular font-mono">{{ snapshot.stored }}</p>
                <p class="text-sm whitespace-nowrap text-text-muted">
                  of <span class="tabular font-mono">{{ snapshot.uploaded }}</span> sent
                </p>
              </div>
            </li>
          </ul>
          <div class="flex flex-wrap gap-2 border-t border-border-subtle p-4">
            <span
              class="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 text-sm font-medium"
              >Export GOOD</span
            >
            <span
              class="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 text-sm font-medium"
              >Download zip</span
            >
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
