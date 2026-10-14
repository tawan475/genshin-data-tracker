<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import images from '@gdt/game-data/data/images.json'
import { findCharacterState, findWeaponState } from '@gdt/game-data/planner-math'
import type {
  CharacterCurrent,
  GenshinServer,
  Good,
  PlannerTarget,
  PlannerTask,
  WeaponCurrent,
} from '@gdt/shared'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { Download, FileUp, TriangleAlert } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { isSeelieExport } from '@/data/seelie'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'
import { newGoalId } from './goal-ids'
import type { ResinReading } from './resin'
import {
  SEELIE_SECTIONS,
  defaultPicks,
  parseSeelie,
  planSeelie,
  sectionHasChanges,
  type SeelieAccount,
  type SeelieParsed,
  type SeeliePicks,
  type SeelieSection,
  type SeelieWrites,
  type SectionSummary,
} from './seelie-plan'

/**
 * Seelie, both ways. Import: pick or drop an account export, see what each
 * part would change (new / changed / same, what could not be mapped), tick
 * the parts to bring over, apply. Goals, artifact goals, custom characters,
 * current values (as hand-set "Now" states), inventory (as hand edits on
 * the newest capture), tasks, resin and settings are each opt-in
 * (seelie-plan.ts). "Replace" also removes goals the file doesn't have.
 * Export: a Seelie account file of the goals, inventory and tasks
 * (Seelie → Settings → Import Account keeps what the file leaves out).
 */
const props = defineProps<{
  open: boolean
  planner: PlannerData
  /** The newest capture (empty without one); `materials` are the capture's counts. */
  capture: Good
  /** The planner's bag (the capture with the hand edits). */
  bag: Readonly<Record<string, number>>
  targets: readonly PlannerTarget[]
  overrides: ReadonlyMap<string, CharacterCurrent | WeaponCurrent>
  tasks: readonly PlannerTask[]
  resin: ResinReading | null
  /** AR and World Level as the planner uses them; whether irminsul says them. */
  settings: { ar: number | null; wl: number | null; traveler: 'F' | 'M' }
  irminsulAr: boolean
  server: GenshinServer | null
  saving: boolean
}>()
const emit = defineEmits<{ close: []; apply: [writes: SeelieWrites]; export: [] }>()

const ARTIFACT_SETS = Object.keys((images as { artifacts: Record<string, unknown> }).artifacts)

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const fileName = ref('')
const failure = ref('')
const parsed = shallowRef<SeelieParsed | null>(null)
const replace = ref(false)
const picks = reactive<SeeliePicks>(
  Object.fromEntries(SEELIE_SECTIONS.map((s) => [s, false])) as SeeliePicks,
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    fileName.value = ''
    failure.value = ''
    parsed.value = null
    replace.value = false
  },
)

const account = computed<SeelieAccount>(() => ({
  capture: props.capture,
  bag: props.bag,
  targets: props.targets,
  overrides: props.overrides,
  tasks: props.tasks,
  resin: props.resin,
  settings: props.settings,
  server: props.server,
  newId: newGoalId,
}))

async function read(file: File | undefined) {
  if (!file) return
  fileName.value = file.name
  failure.value = ''
  parsed.value = null
  try {
    const json: unknown = JSON.parse(await file.text())
    if (!isSeelieExport(json)) throw new Error(t('planner.seelieImport.notExport'))
    const result = parseSeelie(
      json,
      props.planner,
      {
        character: (key) => findCharacterState(props.capture.characters, key).state,
        refinement: (key, owner) =>
          findWeaponState(props.capture.weapons, key, owner).state.refinement,
        artifactSets: ARTIFACT_SETS,
      },
      props.server,
      Date.now(),
    )
    const none = Object.fromEntries(SEELIE_SECTIONS.map((s) => [s, false])) as SeeliePicks
    Object.assign(
      picks,
      defaultPicks(planSeelie(result, account.value, none), {
        irminsulAr: props.irminsulAr,
        server: props.server,
      }),
    )
    parsed.value = result
  } catch (cause) {
    failure.value =
      cause instanceof SyntaxError
        ? t('planner.seelieImport.notJson')
        : String((cause as Error).message)
  }
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  void read(target.files?.[0])
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void read(event.dataTransfer?.files?.[0])
}

const plan = computed(() =>
  parsed.value ? planSeelie(parsed.value, account.value, { ...picks }, replace.value) : null,
)

const sectionText = (id: SeelieSection) => ({
  label: t(`planner.seelieImport.section.${id}.label`),
  title: t(`planner.seelieImport.section.${id}.title`),
})

/** "12 new · 3 changed · 4 same", zeros left out. */
function breakdown(s: SectionSummary) {
  const parts = [
    [s.added, 'new'],
    [s.changed, 'changed'],
    [s.same, 'same'],
  ] as const
  return [
    ...parts
      .filter(([n]) => n > 0)
      .map(([n, kind]) => t(`planner.seelieImport.count.${kind}`, { n: formatNumber(n) })),
    ...s.facts,
  ].join(' · ')
}

const rows = computed(() => {
  const p = plan.value
  if (!p) return []
  return SEELIE_SECTIONS.filter((id) => p.sections[id].total > 0).map((id) => ({
    id,
    ...sectionText(id),
    data: p.sections[id],
    available: sectionHasChanges(p.sections[id]),
  }))
})

const writes = computed(() => plan.value?.writes ?? null)
const canApply = computed(() => {
  const w = writes.value
  if (!w) return false
  return (
    w.targets.length + w.current.length + w.inventory.length + w.tasks.length > 0 ||
    !!w.resin ||
    !!w.traveler ||
    !!w.server ||
    Object.keys(w.settings).length > 0
  )
})

function apply() {
  if (writes.value) emit('apply', writes.value)
}
</script>

<template>
  <UiModal :open="open" title="Seelie" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors"
        :class="dragging ? 'border-accent bg-surface-overlay' : 'border-border-strong'"
        :title="$t('planner.seelieImport.dropTitle')"
        @dragenter.prevent="dragging = true"
        @dragover.prevent
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <FileUp class="size-7 text-text-muted" aria-hidden="true" />
        <p v-if="fileName" class="max-w-full truncate font-mono text-sm">{{ fileName }}</p>
        <UiButton size="sm" @click="input?.click()">{{
          fileName ? $t('planner.seelieImport.change') : $t('planner.seelieImport.choose')
        }}</UiButton>
        <input
          ref="input"
          type="file"
          accept=".json,application/json"
          class="hidden"
          :aria-label="$t('planner.seelieImport.fileLabel')"
          @change="onPick"
        />
      </div>

      <p v-if="failure" class="flex items-center gap-2 text-sm text-danger-text" role="alert">
        <TriangleAlert class="size-4" aria-hidden="true" />
        {{ failure }}
      </p>

      <template v-if="plan">
        <fieldset
          class="flex min-w-0 flex-col divide-y divide-border-subtle rounded-lg border border-border-default"
        >
          <legend class="sr-only">{{ $t('planner.seelieImport.legend') }}</legend>
          <label
            v-for="row in rows"
            :key="row.id"
            class="flex min-h-12 items-center gap-3 px-3 py-1.5"
            :class="row.available ? 'cursor-pointer' : 'opacity-60'"
            :title="row.title"
          >
            <input
              v-model="picks[row.id]"
              type="checkbox"
              class="size-5 shrink-0 cursor-pointer accent-accent"
              :disabled="!row.available"
            />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-sm font-medium">{{ row.label }}</span>
              <span class="truncate text-xs text-text-secondary">{{ breakdown(row.data) }}</span>
            </span>
            <span class="tabular font-mono text-lg font-semibold">{{
              formatNumber(row.data.total)
            }}</span>
          </label>
        </fieldset>

        <div v-if="plan.unmapped.length" class="flex flex-col gap-1.5">
          <span class="text-xs text-text-muted">{{
            $t('planner.seelieImport.skipped', { n: plan.unmapped.length })
          }}</span>
          <span class="flex flex-wrap gap-1">
            <UiBadge v-for="slug in plan.unmapped" :key="slug" tone="warning">{{ slug }}</UiBadge>
          </span>
        </div>
        <p
          v-if="plan.clamped"
          class="text-xs text-text-muted"
          :title="$t('planner.seelieImport.clampedTitle')"
        >
          {{ $t('planner.seelieImport.clamped', { n: plan.clamped }) }}
        </p>

        <UiSwitch
          v-if="picks.goals && plan.dropped.length"
          v-model="replace"
          :label="$t('planner.seelieImport.replace', { n: plan.dropped.length })"
        />
      </template>
    </div>

    <template #footer>
      <UiButton
        variant="ghost"
        class="mr-auto"
        :title="$t('planner.seelieImport.exportTitle')"
        @click="emit('export')"
      >
        <Download class="size-4" aria-hidden="true" />
        {{ $t('planner.seelieImport.export') }}
      </UiButton>
      <UiButton @click="emit('close')">{{ $t('planner.common.cancel') }}</UiButton>
      <UiButton variant="primary" :disabled="!canApply" :loading="saving" @click="apply">
        {{ $t('planner.seelieImport.import') }}
      </UiButton>
    </template>
  </UiModal>
</template>
