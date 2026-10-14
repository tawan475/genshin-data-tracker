<script setup lang="ts">
import {
  DOMAIN_EVENT_KINDS,
  type DomainEventKind,
  type DomainEventWindow,
  type StaffSiteResponse,
} from '@gdt/shared'
import { computed, ref, useId, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { t } from '@/i18n'

/**
 * The domain event windows staff set (site_settings `farm.events`): a run
 * of Overflowing Abundance & co. the game data has not caught up with yet.
 * Times are the server's local time, like the game's announcements; every
 * server sees the same local window.
 */
const props = defineProps<{ open: boolean; site: StaffSiteResponse | null; busy?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [events: DomainEventWindow[]] }>()
const formId = useId()

interface Row {
  kind: DomainEventKind
  start: string
  end: string
  dailyClaims: string
  source: string
}
const rows = ref<Row[]>([])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    rows.value = (props.site?.domainEvents ?? []).map((event) => ({
      kind: event.kind,
      start: event.start,
      end: event.end,
      dailyClaims: event.dailyClaims === null ? '' : String(event.dailyClaims),
      source: event.source,
    }))
  },
)

const kindOptions = computed(() =>
  DOMAIN_EVENT_KINDS.map((value) => ({ value, label: t(`farm.event.names.${value}`) })),
)

/** Next Monday 04:00 to the Monday after, the usual run. */
function nextWeek(): { start: string; end: string } {
  const now = new Date()
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  day.setDate(day.getDate() + ((8 - day.getDay()) % 7 || 7))
  const local = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T04:00`
  const end = new Date(day)
  end.setDate(end.getDate() + 7)
  return { start: local(day), end: local(end) }
}

function add() {
  rows.value.push({ kind: 'abundance', ...nextWeek(), dailyClaims: '3', source: '' })
}

const invalid = (row: Row) => !row.start || !row.end || row.start >= row.end
const canSave = computed(() => rows.value.every((row) => !invalid(row)))

function submit() {
  if (!canSave.value) return
  emit(
    'confirm',
    rows.value.map((row) => ({
      kind: row.kind,
      start: row.start.slice(0, 16),
      end: row.end.slice(0, 16),
      multiplier: 2,
      dailyClaims: row.dailyClaims.trim() ? Number(row.dailyClaims) : null,
      version: '',
      source: row.source.trim(),
    })),
  )
}
</script>

<template>
  <UiModal :open="open" :title="$t('staff.events.title')" size="wide" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-3" @submit.prevent="submit">
      <p class="text-sm text-text-secondary">{{ $t('staff.events.hint') }}</p>
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="grid grid-cols-1 gap-2 rounded-lg border border-border-subtle p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <UiSelect v-model="row.kind" :options="kindOptions" :aria-label="$t('staff.events.kind')" />
        <UiInput
          v-model="row.start"
          type="datetime-local"
          :aria-label="$t('staff.events.start')"
          :title="$t('staff.events.start')"
        />
        <UiInput
          v-model="row.end"
          type="datetime-local"
          :invalid="invalid(row)"
          :aria-label="$t('staff.events.end')"
          :title="$t('staff.events.end')"
        />
        <UiIconButton :label="$t('staff.events.remove')" @click="rows.splice(i, 1)">
          <Trash2 class="size-4" aria-hidden="true" />
        </UiIconButton>
        <UiInput
          v-model="row.dailyClaims"
          type="number"
          min="1"
          inputmode="numeric"
          :placeholder="$t('staff.events.claims')"
          :aria-label="$t('staff.events.claims')"
        />
        <UiInput
          v-model="row.source"
          class="sm:col-span-2"
          maxlength="300"
          :placeholder="$t('staff.events.source')"
          :aria-label="$t('staff.events.source')"
        />
      </div>
      <UiButton variant="ghost" class="self-start" @click="add">
        <Plus class="size-4" aria-hidden="true" />
        {{ $t('staff.events.add') }}
      </UiButton>
    </form>
    <template #footer>
      <UiButton @click="emit('close')">{{ $t('staff.common.cancel') }}</UiButton>
      <UiButton
        variant="primary"
        type="submit"
        :form="formId"
        :loading="busy"
        :disabled="!canSave"
        >{{ $t('staff.common.save') }}</UiButton
      >
    </template>
  </UiModal>
</template>
