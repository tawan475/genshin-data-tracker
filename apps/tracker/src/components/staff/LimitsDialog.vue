<script setup lang="ts">
import type { StaffSiteResponse } from '@gdt/shared'
import { ref, useId, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { formatBytes, formatNumber } from '@/lib/format'

const MB = 1024 * 1024

export interface LimitsPatch {
  dailySnapshots: number | null
  dailyBytes: number | null
  storageQuota: number | null
}

/** The upload limits every user gets (a user's own quota is set on their page). */
const props = defineProps<{ open: boolean; site: StaffSiteResponse | null; busy?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [patch: LimitsPatch] }>()
const snapshots = ref('')
const daily = ref('')
const quota = ref('')
const formId = useId()

watch(
  () => props.open,
  (open) => {
    const limits = props.site?.limits
    if (!open || !limits) return
    snapshots.value = String(limits.dailySnapshots)
    daily.value = String(Math.round(limits.dailyBytes / MB))
    quota.value = String(Math.round(limits.storageQuota / MB))
  },
)

/** A value equal to the code's default is stored as "the default" (null). */
function value(text: string, scale: number, fallback: number): number | null {
  const n = Math.round(Number(text) * scale)
  return !Number.isFinite(n) || n < 0 || n === fallback ? null : n
}

function submit() {
  const defaults = props.site?.defaults
  if (!defaults) return
  emit('confirm', {
    dailySnapshots: value(snapshots.value, 1, defaults.dailySnapshots),
    dailyBytes: value(daily.value, MB, defaults.dailyBytes),
    storageQuota: value(quota.value, MB, defaults.storageQuota),
  })
}

function reset() {
  emit('confirm', { dailySnapshots: null, dailyBytes: null, storageQuota: null })
}
</script>

<template>
  <UiModal :open="open" :title="$t('staff.limits.title')" @close="emit('close')">
    <form v-if="site" :id="formId" class="flex flex-col gap-4" @submit.prevent="submit">
      <UiField
        v-slot="{ id, describedBy }"
        :label="$t('staff.limits.snapshots')"
        :hint="$t('staff.limits.default', { value: formatNumber(site.defaults.dailySnapshots) })"
      >
        <UiInput
          :id="id"
          v-model="snapshots"
          type="number"
          min="0"
          inputmode="numeric"
          :aria-describedby="describedBy"
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        :label="$t('staff.limits.bytes')"
        :hint="$t('staff.limits.default', { value: formatBytes(site.defaults.dailyBytes) })"
      >
        <UiInput
          :id="id"
          v-model="daily"
          type="number"
          min="0"
          inputmode="numeric"
          :aria-describedby="describedBy"
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        :label="$t('staff.limits.quota')"
        :hint="$t('staff.limits.default', { value: formatBytes(site.defaults.storageQuota) })"
      >
        <UiInput
          :id="id"
          v-model="quota"
          type="number"
          min="0"
          inputmode="numeric"
          :aria-describedby="describedBy"
        />
      </UiField>
    </form>
    <template #footer>
      <UiButton variant="ghost" class="mr-auto" @click="reset">{{
        $t('staff.limits.defaults')
      }}</UiButton>
      <UiButton @click="emit('close')">{{ $t('staff.common.cancel') }}</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :loading="busy">{{
        $t('staff.common.save')
      }}</UiButton>
    </template>
  </UiModal>
</template>
