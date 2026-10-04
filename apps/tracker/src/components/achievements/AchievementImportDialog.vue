<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { FileJson, FileUp } from 'lucide-vue-next'
import type { Achievement } from '@gdt/game-data'
import {
  parseAchievementImport,
  planAchievementImport,
  type AchievementImportPlan,
  type DoneState,
  type ParsedAchievementImport,
} from '@gdt/game-data/achievement-progress'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { formatNumber } from '@/lib/format'

/**
 * Marks achievements done from another tracker's file: a Seelie account
 * export, or a GOOD file with `gi_achievements` (stardb, irminsul). Only ids
 * not already done are added.
 */
const props = defineProps<{
  open: boolean
  state: DoneState
  known: ReadonlyMap<number, Achievement>
  /** Saves the marks; resolves false when that failed. */
  save: (ids: number[]) => Promise<boolean>
}>()
const emit = defineEmits<{ close: [] }>()

const FORMAT_LABELS: Record<ParsedAchievementImport['format'], string> = {
  seelie: 'Seelie',
  good: 'GOOD',
  list: 'Id list',
}

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const reading = ref(false)
const saving = ref(false)
const fileName = ref('')
const failure = ref('')
const parsed = shallowRef<ParsedAchievementImport | null>(null)

const plan = computed<AchievementImportPlan | null>(() =>
  parsed.value ? planAchievementImport(parsed.value.ids, props.state, props.known) : null,
)

function reset() {
  fileName.value = ''
  failure.value = ''
  parsed.value = null
  dragging.value = false
}
watch(
  () => props.open,
  (open) => open && reset(),
)

async function read(file: File | undefined) {
  if (!file) return
  reset()
  fileName.value = file.name
  reading.value = true
  try {
    const result = parseAchievementImport(JSON.parse(await file.text()))
    if (result) parsed.value = result
    else failure.value = 'No achievements found'
  } catch {
    failure.value = 'Not a JSON file'
  } finally {
    reading.value = false
  }
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  void read(target.files?.[0])
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void read(event.dataTransfer?.files[0])
}

async function add() {
  const ids = plan.value?.add
  if (!ids?.length) return
  saving.value = true
  try {
    if (await props.save(ids)) emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UiModal :open="open" title="Import" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors"
        :class="dragging ? 'border-accent bg-surface-overlay' : 'border-border-strong'"
        title="Seelie: Settings → Export Account. stardb or irminsul: a GOOD file with gi_achievements."
        @dragenter.prevent="dragging = true"
        @dragover.prevent
        @dragleave.self="dragging = false"
        @drop.prevent="onDrop"
      >
        <FileUp class="size-8 text-text-muted" aria-hidden="true" />
        <p class="text-sm font-medium">Seelie or stardb file</p>
        <UiButton :loading="reading" @click="input?.click()">Browse</UiButton>
        <input
          ref="input"
          type="file"
          accept=".json,application/json"
          class="hidden"
          tabindex="-1"
          aria-hidden="true"
          @change="onPick"
        />
      </div>

      <div v-if="fileName" class="flex flex-col gap-3" aria-live="polite">
        <p class="flex min-w-0 items-center gap-2 text-sm">
          <FileJson class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span class="truncate font-medium">{{ fileName }}</span>
          <span v-if="parsed" class="shrink-0 text-text-muted">{{
            FORMAT_LABELS[parsed.format]
          }}</span>
        </p>
        <p v-if="failure" class="text-sm text-danger-text" role="alert">{{ failure }}</p>
        <dl v-else-if="plan && parsed" class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg bg-surface-overlay px-2 py-2">
            <dt class="text-xs text-text-muted">In file</dt>
            <dd class="tabular font-mono text-lg font-medium">
              {{ formatNumber(parsed.ids.length) }}
            </dd>
          </div>
          <div class="rounded-lg bg-surface-overlay px-2 py-2">
            <dt class="text-xs text-text-muted">Done already</dt>
            <dd class="tabular font-mono text-lg font-medium">{{ formatNumber(plan.already) }}</dd>
          </div>
          <div
            class="rounded-lg bg-surface-overlay px-2 py-2"
            :title="
              plan.unknown || plan.disused
                ? `Includes ${formatNumber(plan.unknown)} newer than the game data and ${formatNumber(plan.disused)} removed from the game: kept, not counted`
                : undefined
            "
          >
            <dt class="text-xs text-text-muted">New</dt>
            <dd class="tabular font-mono text-lg font-medium text-accent-text">
              {{ formatNumber(plan.add.length) }}
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <template #footer>
      <UiButton variant="ghost" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :disabled="!plan?.add.length" :loading="saving" @click="add">
        Add {{ plan?.add.length ? formatNumber(plan.add.length) : '' }}
      </UiButton>
    </template>
  </UiModal>
</template>
