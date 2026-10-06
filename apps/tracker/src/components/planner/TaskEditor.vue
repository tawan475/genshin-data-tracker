<script setup lang="ts">
import type { CustomTask, TaskMode } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import NoteInput from './NoteInput.vue'
import { WEEKDAY_LABELS } from '@gdt/game-data/planner-math'
import { weekdayOf } from './tasks'

/**
 * A task of the player's own (Seelie's custom tasks): name, every 1–7 days,
 * the day it is next due (today or the next six), whether it repeats from
 * that rhythm or from the day it was done, and a note. Saved by its button;
 * an existing one can be deleted.
 */
const props = defineProps<{
  open: boolean
  /** The task to edit; null adds one. */
  task: CustomTask | null
  /** Its due day (a day number); for a new one, ignored. */
  due: number | null
  /** Today's game day (a day number). */
  today: number
}>()
const emit = defineEmits<{
  close: []
  save: [task: CustomTask, due: number]
  remove: []
}>()

const name = ref('')
const every = ref(1)
const start = ref(0)
const mode = ref<TaskMode>('original')
const note = ref('')
const nameInvalid = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.task?.name ?? ''
    every.value = props.task?.every ?? 1
    mode.value = props.task?.mode ?? 'original'
    note.value = props.task?.note ?? ''
    // An overdue task starts today again; a later one keeps its day (up to six days out).
    start.value = props.due === null ? 0 : Math.max(0, Math.min(6, props.due - props.today))
    nameInvalid.value = false
  },
  { immediate: true },
)

const everyOptions = Array.from({ length: 7 }, (_, i) => ({
  value: i + 1,
  label: i === 0 ? 'Every day' : `Every ${i + 1} days`,
}))
const startOptions = computed(() =>
  Array.from({ length: 7 }, (_, i) => ({
    value: i,
    label:
      i === 0
        ? `Today (${WEEKDAY_LABELS[weekdayOf(props.today)]})`
        : i === 1
          ? `Tomorrow (${WEEKDAY_LABELS[weekdayOf(props.today + 1)]})`
          : WEEKDAY_LABELS[weekdayOf(props.today + i)]!,
  })),
)
const MODES = [
  { value: 'original' as const, label: 'Start day', title: 'Keeps the rhythm of its start day' },
  { value: 'completed' as const, label: 'Done day', title: 'Counts from the day it was done' },
]

function save() {
  const n = name.value.trim().slice(0, 80)
  if (!n) {
    nameInvalid.value = true
    return
  }
  const text = note.value.trim().slice(0, 1000)
  emit(
    'save',
    { name: n, every: every.value, mode: mode.value, ...(text ? { note: text } : {}) },
    // Unchanged day pick on an overdue task: leave it where it is.
    props.due !== null && props.due < props.today && start.value === 0
      ? props.due
      : props.today + start.value,
  )
}
</script>

<template>
  <UiModal :open="open" :title="task ? 'Task' : 'New task'" @close="emit('close')">
    <form id="task-form" class="flex flex-col gap-4" @submit.prevent="save">
      <UiField label="Name" :error="nameInvalid ? 'Name it' : undefined">
        <template #default="{ id, describedBy }">
          <UiInput
            :id="id"
            v-model="name"
            maxlength="80"
            autofocus
            autocomplete="off"
            :invalid="nameInvalid"
            :aria-describedby="describedBy"
          />
        </template>
      </UiField>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex min-w-0 flex-col gap-1">
          <span class="text-sm text-text-secondary">Repeats</span>
          <UiSelect v-model="every" :options="everyOptions" />
        </label>
        <label class="flex min-w-0 flex-col gap-1">
          <span class="text-sm text-text-secondary">{{ task ? 'Next' : 'Starts' }}</span>
          <UiSelect v-model="start" :options="startOptions" />
        </label>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-text-secondary">Counts from</span>
        <UiSegmented v-model="mode" :options="MODES" label="Counts from" />
      </div>
      <NoteInput v-model="note" />
    </form>
    <template #footer>
      <UiButton
        v-if="task"
        variant="ghost"
        class="mr-auto text-danger-text"
        @click="emit('remove')"
      >
        <Trash2 class="size-4" aria-hidden="true" />
        Delete
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" type="submit" form="task-form">Save</UiButton>
    </template>
  </UiModal>
</template>
