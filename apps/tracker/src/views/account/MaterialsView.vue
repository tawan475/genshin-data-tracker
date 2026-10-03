<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Upload } from 'lucide-vue-next'
import MaterialPicker from '@/components/materials/MaterialPicker.vue'
import MaterialsChartPanel from '@/components/materials/MaterialsChartPanel.vue'
import MaterialsInventory from '@/components/materials/MaterialsInventory.vue'
import { useMaterialIcons } from '@/components/materials/use-material-icons'
import { ALL_DAYS, useMaterialsGraph } from '@/components/materials/use-materials-graph'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { chartFrame, loadMaterialsHistory } from '@/data/materials'
import { useResource } from '@/data/use-resource'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAccount } from './context'

const DAY = 86_400_000

const account = useAccount()
const history = useResource(
  () => account.value,
  (a) => (a.latest ? loadMaterialsHistory(a) : Promise.resolve(null)),
)
const hasSnapshots = computed(
  () => account.value.latest !== null && history.data.value?.times.length !== 0,
)
const graph = useMaterialsGraph(() => account.value.id)
const icon = useMaterialIcons()

const frame = computed(() => {
  const data = history.data.value
  if (!data) return null
  const end = Math.max(data.lastSeenAt, data.times.at(-1) ?? 0)
  const from = graph.range.value === ALL_DAYS ? -Infinity : end - graph.range.value * DAY
  return chartFrame(data, from, graph.groupBy.value)
})

const PROPERTIES_KEY = 'materials:show-properties'
const includeProperties = ref(readStorage(PROPERTIES_KEY) === '1')
watch(includeProperties, (on) => writeStorage(PROPERTIES_KEY, on ? '1' : null))

const importTo = computed(() => ({
  name: 'account-import',
  params: { accountId: account.value.id },
}))
</script>

<template>
  <div>
    <PageHeader title="Materials" />

    <UiPanel v-if="!hasSnapshots">
      <UiEmpty title="No snapshots yet">
        <UiButton variant="primary" :to="importTo">
          <Upload class="size-4" aria-hidden="true" />
          Import
        </UiButton>
      </UiEmpty>
    </UiPanel>

    <UiError
      v-else-if="history.error.value && !history.data.value"
      title="Could not load materials"
      :error="history.error.value"
      @retry="history.reload"
    />

    <div v-else-if="history.data.value && frame" class="flex flex-col gap-6">
      <MaterialsChartPanel
        v-model:group-by="graph.groupBy.value"
        v-model:range="graph.range.value"
        :history="history.data.value"
        :frame="frame"
        :keys="graph.selectedKeys.value"
        :ready="graph.ready.value"
        :icon="icon"
        @remove="graph.remove"
        @reset="graph.reset"
      />
      <div class="grid items-start gap-6 xl:grid-cols-3">
        <MaterialPicker
          :history="history.data.value"
          :frame="frame"
          :selected="graph.selectedKeys.value"
          :icon="icon"
          :include-properties="includeProperties"
          @toggle="graph.toggle"
        />
        <MaterialsInventory
          v-model:include-properties="includeProperties"
          class="xl:col-span-2"
          :history="history.data.value"
          :icon="icon"
          :import-to="importTo"
        />
      </div>
    </div>

    <div v-else class="flex flex-col gap-6" aria-busy="true" aria-label="Loading materials">
      <UiPanel>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <UiSkeleton class="h-7 w-32" />
          <UiSkeleton class="h-10 w-72" />
        </div>
        <div class="mb-4 flex flex-wrap gap-2">
          <UiSkeleton class="h-11 w-32" />
          <UiSkeleton class="h-11 w-36" />
        </div>
        <UiSkeleton class="h-72 w-full" />
      </UiPanel>
      <div class="grid items-start gap-6 xl:grid-cols-3">
        <UiPanel>
          <div class="flex flex-col gap-3">
            <UiSkeleton class="h-7 w-40" />
            <UiSkeleton class="h-11 w-full" />
            <div v-for="n in 6" :key="n" class="flex items-center gap-3">
              <UiSkeleton class="size-9 shrink-0" />
              <UiSkeleton class="h-5 flex-1" />
            </div>
          </div>
        </UiPanel>
        <UiPanel class="xl:col-span-2">
          <div class="flex flex-col gap-3">
            <UiSkeleton class="h-7 w-32" />
            <UiSkeleton class="h-11 w-full" />
            <div v-for="n in 8" :key="n" class="flex items-center gap-3">
              <UiSkeleton class="size-9 shrink-0" />
              <UiSkeleton class="h-5 flex-1" />
              <UiSkeleton class="h-5 w-20" />
            </div>
          </div>
        </UiPanel>
      </div>
    </div>
  </div>
</template>
