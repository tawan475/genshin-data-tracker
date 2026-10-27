<script setup lang="ts">
import { computed } from 'vue'
import {
  Compass,
  Eye,
  Flame,
  Landmark,
  MapPin,
  ScrollText,
  Sparkles,
  Swords,
  Timer,
} from 'lucide-vue-next'
import { loadFarming } from '@gdt/game-data/farming'
import NotCaptured from './NotCaptured.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { idLabel, type CollectionCatalog } from '@/data/collection-names'
import { respawnRows } from '@/data/respawns'
import { useResource } from '@/data/use-resource'
import { worldModel, type Progress } from '@/data/world'
import { localizeFarming } from '@/i18n/localize-farming'
import { formatNumber, formatRelative, formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

/**
 * The World (Capture 1.6.0's `gi_exploration`): each scene's map (Teleport
 * Waypoints, domains, areas revealed), the Statues of The Seven, reputation,
 * offerings and exploration per region. Exploration shows raw points until
 * the game data carries each area's total. Bosses' and elites' respawns
 * (Capture 1.7.0) come from the newest capture's `gi_tasks`.
 */
const props = defineProps<{ captured: CapturedCollections; catalog: CollectionCatalog }>()

const exploration = computed(() => props.captured.exploration?.value ?? null)
const farming = useResource(
  () => 0,
  () => loadFarming().catch(() => null),
)
const respawns = computed(() => {
  const value = props.captured.respawns?.value
  if (!value) return []
  const data = farming.data.value
  return respawnRows(value, data ? localizeFarming(data) : null, Date.now())
})
const waiting = computed(() => respawns.value.filter((r) => r.next !== null))
const world = computed(() =>
  exploration.value ? worldModel(exploration.value, props.catalog) : null,
)
const teyvat = computed(() => world.value?.maps.find((m) => m.name === null) ?? null)
const reputationTotal = computed(() =>
  (world.value?.reputation ?? []).reduce(
    (sum, r) => ({ have: sum.have + Math.min(r.level, r.max), total: sum.total + r.max }),
    { have: 0, total: 0 },
  ),
)

const sceneName = (name: string | null) => name ?? t('collections.world.teyvat')
const offeringName = (id: number, name: string) =>
  name || t('collections.world.offering', { n: id })
const fraction = (p: Progress) => `${formatNumber(p.have)} / ${formatNumber(p.total)}`
const MAP_PARTS = [
  { key: 'waypoints', icon: MapPin, label: 'collections.world.waypoints' },
  { key: 'domains', icon: Swords, label: 'collections.world.domains' },
  { key: 'areas', icon: Eye, label: 'collections.world.areas' },
] as const
</script>

<template>
  <NotCaptured v-if="!exploration || !world" :title="$t('collections.tabs.world')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li v-for="part in MAP_PARTS" :key="part.key" class="flex min-w-0">
        <UiStat
          :label="$t(part.label)"
          :hint="$t('collections.world.inTeyvat', { what: $t(part.label) })"
        >
          <template #icon
            ><component :is="part.icon" class="size-3.5" aria-hidden="true"
          /></template>
          <template #value>
            <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
              {{ formatNumber(teyvat?.[part.key].have ?? 0)
              }}<span class="text-sm text-text-muted">
                / {{ formatNumber(teyvat?.[part.key].total ?? 0) }}</span
              >
            </span>
          </template>
          <UiProgress
            class="mt-1"
            :value="teyvat?.[part.key].have ?? 0"
            :max="teyvat?.[part.key].total ?? 0"
            :label="$t(part.label)"
          />
        </UiStat>
      </li>
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.world.reputation')">
          <template #icon><ScrollText class="size-3.5" aria-hidden="true" /></template>
          <template #value>
            <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
              {{ formatNumber(reputationTotal.have)
              }}<span class="text-sm text-text-muted">
                / {{ formatNumber(reputationTotal.total) }}</span
              >
            </span>
          </template>
          <UiProgress
            class="mt-1"
            :value="reputationTotal.have"
            :max="reputationTotal.total"
            :label="$t('collections.world.reputation')"
          />
        </UiStat>
      </li>
    </ul>

    <UiPanel v-if="world.maps.length" :title="$t('collections.world.map')" flush>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 p-3 sm:p-5">
        <li
          v-for="map in world.maps"
          :key="map.scene"
          class="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border-default bg-surface-sunken p-3"
        >
          <div class="flex min-w-0 items-center gap-2">
            <Compass class="size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <h3 class="min-w-0 truncate font-semibold" :title="sceneName(map.name)">
              {{ sceneName(map.name) }}
            </h3>
          </div>
          <dl class="flex flex-col gap-2">
            <template v-for="part in MAP_PARTS" :key="part.key">
              <div v-if="map[part.key].total > 0" class="flex flex-col gap-1">
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <dt class="flex min-w-0 items-center gap-1.5 text-text-secondary">
                    <component :is="part.icon" class="size-3.5 shrink-0" aria-hidden="true" />
                    <span class="truncate">{{ $t(part.label) }}</span>
                  </dt>
                  <dd class="tabular shrink-0 font-mono">{{ fraction(map[part.key]) }}</dd>
                </div>
                <UiProgress
                  :value="map[part.key].have"
                  :max="map[part.key].total"
                  :label="`${sceneName(map.name)} · ${$t(part.label)}`"
                />
              </div>
            </template>
          </dl>
        </li>
      </ul>
    </UiPanel>

    <div class="flex flex-wrap gap-4">
      <UiPanel
        v-if="world.statues.length"
        class="min-w-0 flex-[999_1_28rem]"
        :title="$t('collections.world.statues')"
        flush
      >
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-2 p-3 sm:p-5">
          <li
            v-for="statue in world.statues"
            :key="statue.city"
            class="flex min-w-0 items-center gap-3 rounded-xl border border-border-default bg-surface-sunken p-2.5"
            :title="statue.statue"
          >
            <span
              class="tabular grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 font-mono font-semibold text-accent-text"
              >{{ statue.level }}</span
            >
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-medium">{{ statue.name }}</span>
              <span class="truncate text-xs text-text-secondary">
                {{ $t('collections.world.level', { n: statue.level }) }}
                <template v-if="statue.oculi">
                  · {{ $t('collections.world.oculi', { n: formatNumber(statue.oculi) }) }}</template
                >
              </span>
            </span>
          </li>
        </ul>
      </UiPanel>

      <UiPanel
        v-if="world.reputation.length"
        class="min-w-0 flex-[999_1_20rem]"
        :title="$t('collections.world.reputation')"
        flush
      >
        <ul class="flex flex-col gap-3 p-3 sm:p-5">
          <li v-for="rep in world.reputation" :key="rep.city" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-2 text-sm">
              <span class="min-w-0 truncate font-medium">{{ rep.name }}</span>
              <span class="tabular shrink-0 font-mono"
                >{{ rep.level }}<span class="text-text-muted"> / {{ rep.max }}</span></span
              >
            </div>
            <UiProgress :value="rep.level" :max="rep.max" :label="rep.name" />
          </li>
        </ul>
      </UiPanel>
    </div>

    <UiPanel v-if="world.offerings.length" :title="$t('collections.world.offerings')" flush>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2 p-3 sm:p-5">
        <li
          v-for="offering in world.offerings"
          :key="offering.id"
          class="flex min-w-0 flex-col gap-1.5 rounded-xl border p-2.5"
          :class="
            offering.max > 0 && offering.level >= offering.max
              ? 'border-success-text/40 bg-success-text/10'
              : 'border-border-default bg-surface-sunken'
          "
        >
          <div class="flex min-w-0 items-center gap-2">
            <Flame class="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
            <span
              class="min-w-0 flex-1 truncate text-sm font-medium"
              :title="offeringName(offering.id, offering.name)"
              >{{ offeringName(offering.id, offering.name) }}</span
            >
            <span class="tabular shrink-0 font-mono text-sm"
              >{{ offering.level
              }}<span v-if="offering.max" class="text-text-muted"> / {{ offering.max }}</span></span
            >
          </div>
          <UiProgress
            v-if="offering.max"
            :value="offering.level"
            :max="offering.max"
            :label="offeringName(offering.id, offering.name)"
          />
        </li>
      </ul>
    </UiPanel>

    <UiPanel v-if="world.exploration.length" :title="$t('collections.world.exploration')" flush>
      <template #actions>
        <span
          v-if="world.exploration.some((c) => c.areas.some((a) => a.percent === null))"
          class="flex items-center gap-1 text-xs text-text-muted"
          :title="$t('collections.world.pointsHint')"
        >
          <Sparkles class="size-3.5" aria-hidden="true" />{{ $t('collections.world.pointsOnly') }}
        </span>
      </template>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4 p-3 sm:p-5">
        <section v-for="city in world.exploration" :key="city.city" class="min-w-0">
          <h3 class="mb-1.5 flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <Landmark class="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
            <span class="truncate">{{ city.name || $t('collections.world.otherAreas') }}</span>
          </h3>
          <ul class="flex flex-col divide-y divide-border-default">
            <li
              v-for="area in city.areas"
              :key="area.area"
              class="flex min-w-0 items-center gap-2 py-1.5 text-sm"
            >
              <span class="min-w-0 flex-1 truncate" :title="area.name">{{
                area.name || idLabel(area.area)
              }}</span>
              <span
                v-if="area.percent !== null"
                class="tabular shrink-0 font-mono"
                :class="area.percent >= 100 ? 'text-success-text' : ''"
                >{{ area.percent }}%</span
              >
              <span
                v-else
                class="tabular shrink-0 font-mono text-text-secondary"
                :title="$t('collections.world.pointsHint')"
                >{{ $t('collections.world.points', { n: formatNumber(area.points) }) }}</span
              >
            </li>
          </ul>
        </section>
      </div>
    </UiPanel>

    <UiPanel v-if="respawns.length" :title="$t('collections.world.respawns')" flush>
      <template #actions>
        <span class="text-sm text-text-secondary">{{
          $t('collections.world.respawnsUp', {
            n: formatNumber(respawns.length - waiting.length),
            total: formatNumber(respawns.length),
          })
        }}</span>
      </template>
      <p v-if="!waiting.length" class="p-5 text-sm text-text-secondary">
        {{ $t('collections.world.allUp') }}
      </p>
      <ul
        v-else
        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-2 p-3 sm:p-5"
      >
        <li
          v-for="row in waiting"
          :key="row.id"
          class="flex min-w-0 items-center gap-2.5 rounded-xl border border-border-default bg-surface-sunken p-2.5 text-sm"
        >
          <Timer class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate font-medium" :title="row.name">{{ row.name }}</span>
          <span v-if="row.spots > 1" class="tabular shrink-0 font-mono text-xs text-text-muted"
            >{{ row.up }}/{{ row.spots }}</span
          >
          <time
            class="tabular shrink-0 font-mono text-text-secondary"
            :datetime="new Date(row.next!).toISOString()"
            :title="formatDateTime(row.next!)"
            >{{ formatRelative(row.next!) }}</time
          >
        </li>
      </ul>
    </UiPanel>
  </div>
</template>
