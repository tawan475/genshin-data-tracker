<script setup lang="ts">
import type { StaffAccountRow } from '@gdt/shared'
import { computed, ref, useId, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { formatNumber } from '@/lib/format'
import type { PurgeBody } from '@/api'
import { t } from '@/i18n'

/**
 * Deletes a Genshin account's data at once, skipping the 30-day trash: the
 * snapshots captured in a date range, the trash, or the whole account.
 * Picking single snapshots is on Inspect's Snapshots page.
 */
const props = defineProps<{ open: boolean; account: StaffAccountRow | null; busy?: boolean }>()
const emit = defineEmits<{ close: []; purge: [body: PurgeBody]; deleteAccount: [] }>()

type Kind = 'range' | 'trash' | 'account'
const kind = ref<Kind>('range')
const from = ref('')
const to = ref('')
const typed = ref('')
const formId = useId()

watch(
  () => props.open,
  (open) => {
    if (!open) return
    kind.value = 'range'
    from.value = ''
    to.value = ''
    typed.value = ''
  },
)

const options = computed(() => [
  { value: 'range' as const, label: t('staff.deleteData.dates') },
  { value: 'trash' as const, label: t('staff.deleteData.trash'), count: props.account?.trash ?? 0 },
  { value: 'account' as const, label: t('staff.deleteData.account') },
])

/** Local midnight of a yyyy-mm-dd input. */
const dayStart = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}

const range = computed(() => {
  if (!from.value || !to.value) return null
  const start = dayStart(from.value)
  const end = dayStart(to.value) + 86_400_000
  return end > start ? { from: start, to: end } : null
})

const ready = computed(() => {
  if (kind.value === 'range') return range.value !== null
  if (kind.value === 'trash') return (props.account?.trash ?? 0) > 0
  return typed.value === 'DELETE'
})

function submit() {
  if (!ready.value) return
  if (kind.value === 'range' && range.value) emit('purge', { kind: 'range', ...range.value })
  else if (kind.value === 'trash') emit('purge', { kind: 'trash' })
  else if (kind.value === 'account') emit('deleteAccount')
}

const name = computed(
  () => props.account?.name || (props.account?.uid ? `UID ${props.account.uid}` : ''),
)
</script>

<template>
  <UiModal :open="open" :title="$t('staff.deleteData.title')" @close="emit('close')">
    <form v-if="account" :id="formId" class="flex flex-col gap-4" @submit.prevent="submit">
      <p class="text-sm font-medium">
        {{ name }}
        <span class="tabular font-mono text-text-muted">
          {{ $t('staff.deleteData.snapshots', { n: formatNumber(account.snapshotCount) }) }}
        </span>
      </p>
      <UiSegmented v-model="kind" :options="options" :label="$t('staff.deleteData.what')" />
      <div v-if="kind === 'range'" class="grid grid-cols-2 gap-3">
        <UiField v-slot="{ id }" :label="$t('staff.deleteData.from')">
          <UiInput :id="id" v-model="from" type="date" />
        </UiField>
        <UiField v-slot="{ id }" :label="$t('staff.deleteData.to')">
          <UiInput :id="id" v-model="to" type="date" />
        </UiField>
      </div>
      <p v-else-if="kind === 'trash'" class="text-sm text-text-secondary">
        {{ $t('staff.deleteData.trashText', { n: formatNumber(account.trash) }) }}
      </p>
      <label v-else class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text-secondary">
          {{ $t('staff.deleteData.accountType') }} <span class="font-code">DELETE</span>
        </span>
        <UiInput v-model="typed" autocomplete="off" spellcheck="false" />
      </label>
      <span class="text-[0.8125rem] text-danger-text">{{ $t('staff.deleteData.noTrash') }}</span>
    </form>
    <template #footer>
      <UiButton @click="emit('close')">{{ $t('staff.common.cancel') }}</UiButton>
      <UiButton variant="danger" type="submit" :form="formId" :disabled="!ready" :loading="busy">
        {{ $t('staff.common.delete') }}
      </UiButton>
    </template>
  </UiModal>
</template>
