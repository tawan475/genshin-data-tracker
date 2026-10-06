<script setup lang="ts">
import { WEEKDAY_LABELS } from '@gdt/game-data/planner-math'
import type { CustomTask, PlannerTask } from '@gdt/shared'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  AlarmClock,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  ListChecks,
  Moon,
  Plus,
  StickyNote,
} from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { formatDateTime, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { useFeedback } from '@/stores/feedback'
import TaskEditor from './TaskEditor.vue'
import {
  BUILTIN_TASKS,
  CUSTOM_SNOOZES,
  dayStart,
  dayText,
  doneInput,
  formatSpan,
  gameDay,
  snoozeChoices,
  snoozedInput,
  taskInput,
  taskRows,
  undoneInput,
  weekdayOf,
  type TaskRow,
} from './tasks'
import { moveBy, moveTo } from './allocation'
import { newGoalId } from './goal-ids'
import { useDragOrder } from './use-drag-order'
import { removeTask, upsertTask, type TaskOp } from './use-planner-tasks'

/**
 * The planner's tasks (Seelie's): the built-in dailies and weeklies whose
 * resets the game keeps (tasks.ts), and the player's own recurring ones.
 * Each row: Done (with Undo), a snooze to a later day, and how long until
 * its reset (red when that is close and it isn't done). Done and snoozed
 * ones rest out of the list until they are due again ("show all" shows
 * them, ticked; a tick takes it back). Custom tasks open their editor and
 * reorder by their handle in the Custom tab. Collapsible; the choice and
 * the tab are this device's.
 */
const props = defineProps<{
  tasks: readonly PlannerTask[]
  now: number
  server: string | null
}>()
const emit = defineEmits<{ change: [ops: TaskOp[]] }>()
const feedback = useFeedback()

type Tab = 'all' | 'builtin' | 'custom'
const open = ref(readStorage('planner:tasks') !== 'closed')
watch(open, (value) => writeStorage('planner:tasks', value ? null : 'closed'))
const tab = ref<Tab>(
  (['builtin', 'custom'] as const).find((t) => t === readStorage('planner:tasks-tab')) ?? 'all',
)
watch(tab, (value) => writeStorage('planner:tasks-tab', value === 'all' ? null : value))
const showAll = ref(false)

const today = computed(() => gameDay(props.now, props.server))
const rows = computed(() => taskRows(props.tasks, props.now, props.server))
const dueRows = computed(() => rows.value.filter((r) => r.due))
const dueCount = (kind?: TaskRow['kind']) =>
  dueRows.value.filter((r) => !kind || r.kind === kind).length
const TABS = computed(() => [
  { value: 'all' as const, label: 'All', count: dueCount() },
  { value: 'builtin' as const, label: 'Permanent', count: dueCount('builtin') },
  { value: 'custom' as const, label: 'Custom', count: dueCount('custom') },
])
const shown = computed(() =>
  rows.value.filter(
    (r) =>
      (tab.value === 'all' || r.kind === tab.value) &&
      (r.due || showAll.value || (tab.value === 'custom' && r.kind === 'custom')),
  ),
)
const resting = computed(
  () => rows.value.filter((r) => !r.due && (tab.value === 'all' || r.kind === tab.value)).length,
)
const soon = computed(() => dueRows.value.filter((r) => r.tone === 'soon'))

// ------------------------------------------------------------ labels

function when(row: TaskRow): { text: string; title: string } {
  if (row.kind === 'builtin') {
    if (row.due) {
      return row.resets === null
        ? { text: 'Ready', title: 'Ready to use' }
        : {
            text: formatSpan(row.resets - props.now),
            title: `Resets ${formatDateTime(row.resets)}`,
          }
    }
    return {
      text: formatSpan(row.back! - props.now),
      title: `${row.snoozed ? 'Snoozed' : 'Done'} · back ${formatDateTime(row.back!)}`,
    }
  }
  const c = row.custom!
  const every = c.task.every === 1 ? 'every day' : `every ${c.task.every} days`
  const from = c.task.mode === 'completed' ? 'from the day done' : 'from its start day'
  const title = `Due ${dayText(c.due)} · ${every}, ${from}`
  if (row.late > 0) return { text: row.late === 1 ? 'Overdue' : `${row.late}d late`, title }
  if (row.late === 0) return { text: 'Today', title }
  if (row.late === -1) return { text: 'Tomorrow', title }
  if (row.late >= -6) return { text: WEEKDAY_LABELS[weekdayOf(c.due)]!, title }
  return { text: `${-row.late}d`, title }
}

const TONE: Record<TaskRow['tone'], string> = {
  soon: 'font-medium text-danger-text',
  today: 'font-medium text-accent-text',
  due: 'text-text-secondary',
  rest: 'text-text-muted',
}

// ------------------------------------------------------------ actions

function change(ops: TaskOp[]) {
  emit('change', ops)
}

function withUndo(title: string, row: TaskRow, ops: TaskOp[]) {
  const before = taskInput(row)
  change(ops)
  feedback.toast({
    tone: 'info',
    title,
    action: { label: 'Undo', run: () => change([upsertTask(before)]) },
  })
}

function tick(row: TaskRow) {
  if (!row.due) {
    change([upsertTask(undoneInput(row))])
    return
  }
  withUndo(`${row.name} done`, row, [upsertTask(doneInput(row, Date.now(), props.server))])
}

const snoozeRow = shallowRef<TaskRow | null>(null)
const snoozeAnchor = ref<HTMLElement | null>(null)
const snoozeOpen = ref(false)
function openSnooze(row: TaskRow, event: Event) {
  snoozeRow.value = row
  snoozeAnchor.value = event.currentTarget as HTMLElement
  snoozeOpen.value = true
}
const snoozes = computed(() => {
  const row = snoozeRow.value
  if (!row) return []
  const now = props.now
  if (row.builtin) return snoozeChoices(row.builtin, now, props.server)
  return CUSTOM_SNOOZES.map((days) => ({
    days,
    until: dayStart(today.value + days, props.server),
    last: false,
  }))
})
const canSnooze = (row: TaskRow) =>
  row.due && (!row.builtin || snoozeChoices(row.builtin, props.now, props.server).length > 0)
function snooze(days: number) {
  const row = snoozeRow.value
  snoozeOpen.value = false
  if (!row) return
  const ops = [upsertTask(snoozedInput(row, days, Date.now(), props.server))]
  const day = WEEKDAY_LABELS[weekdayOf(today.value + days)]
  withUndo(`${row.name}: back ${day}`, row, ops)
}

// ------------------------------------------------------------ built-ins on/off

const listAnchor = ref<HTMLElement | null>(null)
const listOpen = ref(false)
function openList(event: Event) {
  listAnchor.value = event.currentTarget as HTMLElement
  listOpen.value = true
}
const stored = computed(() => new Map(props.tasks.map((t) => [`${t.kind}:${t.id}`, t])))
const hidden = (id: string) => {
  const t = stored.value.get(`builtin:${id}`)
  return t?.kind === 'builtin' && !!t.hidden
}
function setShown(id: string, on: boolean) {
  const t = stored.value.get(`builtin:${id}`)
  const next =
    t?.kind === 'builtin' && t.next !== undefined && t.next !== null ? { next: t.next } : {}
  change([upsertTask({ kind: 'builtin', id, ...next, ...(on ? {} : { hidden: true }) })])
}

// ------------------------------------------------------------ custom tasks

const editorOpen = ref(false)
const editing = shallowRef<TaskRow | null>(null)
function add() {
  editing.value = null
  editorOpen.value = true
}
function edit(row: TaskRow) {
  editing.value = row
  editorOpen.value = true
}
const customRows = computed(() => rows.value.filter((r) => r.kind === 'custom'))
function save(task: CustomTask, due: number) {
  const row = editing.value
  editorOpen.value = false
  if (row?.custom) {
    const input = taskInput(row)
    change([upsertTask({ ...input, kind: 'custom', id: row.id, task, due: dayText(due) })])
    return
  }
  const last = customRows.value.at(-1)?.custom?.position ?? 0
  change([
    upsertTask({
      kind: 'custom',
      id: newGoalId(),
      task,
      due: dayText(due),
      position: customRows.value.length ? last + 1 : 1,
    }),
  ])
  tab.value = tab.value === 'builtin' ? 'all' : tab.value
}
function removeEditing() {
  const row = editing.value
  editorOpen.value = false
  if (!row) return
  const before = taskInput(row)
  change([removeTask({ kind: 'custom', id: row.id })])
  feedback.toast({
    tone: 'info',
    title: `${row.name} deleted`,
    action: { label: 'Undo', run: () => change([upsertTask(before)]) },
  })
}

/** Stores the custom tasks' order as positions 1…n (only those that change). */
function reorder(ids: string[]) {
  const byId = new Map(customRows.value.map((r) => [r.id, r]))
  const ops = ids.flatMap((id, i) => {
    const row = byId.get(id)
    if (!row) return []
    const input = taskInput(row)
    if (input.kind !== 'custom' || input.position === i + 1) return []
    return [upsertTask({ ...input, position: i + 1 })]
  })
  if (ops.length) change(ops)
}
const order = () => customRows.value.map((r) => r.id)
/** Handles and rows carry `task:<id>` (the goal cards' drag helper names its targets so). */
const plain = (id: string) => id.replace(/^task:/, '')
const drag = useDragOrder({
  move: (id, to) => reorder(moveTo(order(), plain(id), plain(to))),
  step: (id, by) => {
    const list = order()
    if (by === 'start' || by === 'end') {
      const rest = list.filter((x) => x !== plain(id))
      reorder(by === 'start' ? [plain(id), ...rest] : [...rest, plain(id)])
    } else reorder(moveBy(list, plain(id), by))
  },
})
const sorting = computed(() => tab.value === 'custom' && customRows.value.length > 1)

const summary = computed(() => {
  const n = dueRows.value.length
  const first = soon.value[0]
  return { n, first: first ? `${first.name} ${when(first).text}` : '' }
})
</script>

<template>
  <section
    class="flex flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm"
    aria-label="Tasks"
  >
    <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-1.5 pr-1.5 pl-2">
      <button
        type="button"
        class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold transition-colors hover:bg-surface-overlay"
        :aria-expanded="open"
        @click="open = !open"
      >
        <ChevronDown
          class="size-4 text-text-muted transition-transform"
          :class="open ? '' : '-rotate-90'"
          aria-hidden="true"
        />
        Tasks
        <span
          class="tabular rounded-md px-1.5 font-mono text-xs"
          :class="
            soon.length
              ? 'bg-danger-surface text-danger-text'
              : 'bg-surface-overlay text-text-secondary'
          "
          :title="`${formatNumber(summary.n)} to do`"
          >{{ formatNumber(summary.n) }}<span class="sr-only"> to do</span></span
        >
      </button>
      <span
        v-if="!open && summary.first"
        class="min-w-0 flex-1 truncate text-sm text-danger-text"
        :title="summary.first"
        >{{ summary.first }}</span
      >
      <template v-if="open">
        <UiSegmented
          v-model="tab"
          :options="TABS"
          label="Tasks shown"
          class="order-last sm:order-none"
        />
        <span class="ml-auto flex items-center">
          <UiIconButton
            :label="showAll ? 'Hide done' : `Show done (${resting})`"
            :active="showAll"
            :aria-pressed="showAll"
            @click="showAll = !showAll"
          >
            <EyeOff v-if="showAll" class="size-4" aria-hidden="true" />
            <Eye v-else class="size-4" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton label="Permanent tasks shown" @click="openList">
            <ListChecks class="size-4" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton label="Add a task" @click="add">
            <Plus class="size-5" aria-hidden="true" />
          </UiIconButton>
        </span>
      </template>
    </header>

    <ul
      v-if="open"
      class="grid grid-cols-1 gap-x-2 border-t border-border-subtle py-1 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Tasks"
    >
      <li v-if="shown.length === 0" class="px-3 py-2 text-sm text-text-muted sm:col-span-full">
        {{ tab === 'custom' ? 'No tasks of your own' : 'All done' }}
      </li>
      <li
        v-for="row in shown"
        :key="row.key"
        class="flex min-h-10 min-w-0 items-center gap-1.5 border-l-2 pr-1 pl-1.5"
        :class="[
          row.tone === 'soon' ? 'border-danger' : 'border-transparent',
          drag.over.value === `task:${row.id}` && drag.dragging.value !== `task:${row.id}`
            ? 'bg-surface-overlay'
            : '',
        ]"
        :data-goal-card="sorting && row.kind === 'custom' ? `task:${row.id}` : undefined"
      >
        <button
          v-if="sorting && row.kind === 'custom'"
          type="button"
          class="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-text-muted hover:bg-surface-overlay hover:text-text-primary active:cursor-grabbing"
          :data-goal-handle="`task:${row.id}`"
          :aria-label="`Move ${row.name}`"
          title="Drag, or arrow keys"
          @pointerdown="drag.start(`task:${row.id}`, $event)"
          @keydown="drag.key(`task:${row.id}`, $event)"
        >
          <GripVertical class="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
          :class="
            row.due
              ? 'group/tick text-transparent hover:text-success-text'
              : 'text-success-text hover:text-text-muted'
          "
          :aria-label="row.due ? `Done: ${row.name}` : `Not done: ${row.name}`"
          :title="row.due ? 'Done' : 'Take back'"
          @click="tick(row)"
        >
          <span
            class="inline-flex size-5 items-center justify-center rounded-full border-2"
            :class="row.due ? 'border-border-strong' : 'border-current bg-surface-overlay'"
          >
            <Check class="size-3.5" stroke-width="3" aria-hidden="true" />
          </span>
        </button>
        <component
          :is="row.kind === 'custom' ? 'button' : 'span'"
          :type="row.kind === 'custom' ? 'button' : undefined"
          class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
          :class="[
            row.due ? 'text-text-primary' : 'text-text-muted',
            row.kind === 'custom' ? 'rounded-md hover:text-accent-text' : '',
          ]"
          :title="row.note ? `${row.name} · ${row.note}` : row.name"
          @click="row.kind === 'custom' ? edit(row) : undefined"
        >
          <span class="truncate">{{ row.name }}</span>
          <StickyNote
            v-if="row.note"
            class="size-3.5 shrink-0 text-text-muted"
            aria-hidden="true"
          />
        </component>
        <span
          class="tabular inline-flex shrink-0 items-center gap-1 font-mono text-xs"
          :class="TONE[row.tone]"
          :title="when(row).title"
        >
          <Moon v-if="row.snoozed" class="size-3.5" aria-hidden="true" />
          {{ when(row).text }}
          <span class="sr-only">: {{ when(row).title }}</span>
        </span>
        <button
          type="button"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:invisible"
          :disabled="!canSnooze(row)"
          :aria-label="`Snooze ${row.name}`"
          title="Snooze"
          @click="openSnooze(row, $event)"
        >
          <AlarmClock class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <UiPopover
      :open="snoozeOpen"
      :anchor="snoozeAnchor"
      :label="`Snooze ${snoozeRow?.name ?? ''}`"
      @close="snoozeOpen = false"
    >
      <ul class="flex flex-col p-1.5">
        <li v-for="c in snoozes" :key="c.days">
          <button
            type="button"
            class="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-surface-overlay"
            @click="snooze(c.days)"
          >
            <span class="font-medium">{{ WEEKDAY_LABELS[weekdayOf(today + c.days)] }}</span>
            <span class="tabular font-mono text-text-secondary">{{
              c.days === 1 ? '1 day' : `${c.days} days`
            }}</span>
            <span v-if="c.last" class="ml-auto text-xs text-text-muted">Last day</span>
          </button>
        </li>
      </ul>
    </UiPopover>

    <UiPopover
      :open="listOpen"
      :anchor="listAnchor"
      label="Permanent tasks"
      @close="listOpen = false"
    >
      <div class="flex flex-col px-4 py-2">
        <UiSwitch
          v-for="b in BUILTIN_TASKS"
          :key="b.id"
          :model-value="!hidden(b.id)"
          :label="b.name"
          @update:model-value="setShown(b.id, $event)"
        />
      </div>
    </UiPopover>

    <TaskEditor
      :open="editorOpen"
      :task="editing?.custom?.task ?? null"
      :due="editing?.custom?.due ?? null"
      :today="today"
      @close="editorOpen = false"
      @save="save"
      @remove="removeEditing"
    />
  </section>
</template>
