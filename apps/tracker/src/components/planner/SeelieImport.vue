<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { findCharacterState, findWeaponState } from '@gdt/game-data/planner-math'
import { isSeelieExport, mapSeelieGoals, type SeelieImport } from '@gdt/game-data/seelie'
import type { Good, PlannerTarget } from '@gdt/shared'
import { computed, ref, shallowRef, watch } from 'vue'
import { FileUp, TriangleAlert } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { formatNumber } from '@/lib/format'
import { characterGoalId, targetId, weaponGoalId } from './model'
import { remove, upsert } from './use-planner-targets'

type Op = ReturnType<typeof upsert> | ReturnType<typeof remove>

/**
 * Goals from a Seelie export: pick or drop the file, see what it maps to
 * (new / changed / same, and what could not be mapped), then apply it as
 * one request. "Replace" also removes goals the file does not have.
 */
const props = defineProps<{
  open: boolean
  planner: PlannerData
  good: Good
  targets: readonly PlannerTarget[]
  saving: boolean
}>()
const emit = defineEmits<{ close: []; apply: [ops: Op[]] }>()

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const fileName = ref('')
const failure = ref('')
const result = shallowRef<SeelieImport | null>(null)
const replace = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    fileName.value = ''
    failure.value = ''
    result.value = null
    replace.value = false
  },
)

async function read(file: File | undefined) {
  if (!file) return
  fileName.value = file.name
  failure.value = ''
  result.value = null
  try {
    const json: unknown = JSON.parse(await file.text())
    if (!isSeelieExport(json)) throw new Error('Not a Seelie export')
    result.value = mapSeelieGoals(json, props.planner, {
      character: (key) => findCharacterState(props.good.characters, key).state,
      refinement: (key, owner) => findWeaponState(props.good.weapons, key, owner).state.refinement,
    })
  } catch (cause) {
    failure.value =
      cause instanceof SyntaxError ? 'Not a JSON file' : String((cause as Error).message)
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

const existing = computed(() => new Map(props.targets.map((t) => [targetId(t), t])))

/** Key order does not matter: the server returns targets as stored. */
const canon = (value: unknown) =>
  JSON.stringify(value, (_, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  )
const same = (a: unknown, b: unknown) => canon(a) === canon(b)

const preview = computed(() => {
  const r = result.value
  if (!r) return null
  const count = (ids: { id: string; target: unknown }[]) => {
    let added = 0
    let changed = 0
    for (const { id, target } of ids) {
      const now = existing.value.get(id)
      if (!now) added++
      else if (!same(now.target, target)) changed++
    }
    return { total: ids.length, added, changed, same: ids.length - added - changed }
  }
  const characters = count(
    r.characters.map((c) => ({ id: characterGoalId(c.key), target: c.target })),
  )
  const weapons = count(
    r.weapons.map((w) => ({ id: weaponGoalId(w.key, w.owner), target: w.target })),
  )
  const incoming = new Set([
    ...r.characters.map((c) => characterGoalId(c.key)),
    ...r.weapons.map((w) => weaponGoalId(w.key, w.owner)),
  ])
  const dropped = props.targets.filter((t) => !incoming.has(targetId(t)))
  return {
    characters,
    weapons,
    dropped,
    unmapped: [...r.unmapped.characters, ...r.unmapped.weapons],
  }
})

/** "12 new · 3 changed", zeros left out. */
function breakdown(data: { added: number; changed: number; same: number }) {
  const parts = [
    [data.added, 'new'],
    [data.changed, 'changed'],
    [data.same, 'same'],
  ] as const
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${formatNumber(n)} ${label}`)
    .join(' · ')
}

const canApply = computed(() => {
  const p = preview.value
  if (!p) return false
  const changes = p.characters.added + p.characters.changed + p.weapons.added + p.weapons.changed
  return changes > 0 || (replace.value && p.dropped.length > 0)
})

function apply() {
  const r = result.value
  const p = preview.value
  if (!r || !p) return
  const ops: Op[] = []
  if (replace.value) {
    for (const t of p.dropped) {
      ops.push(
        remove(
          t.kind === 'character'
            ? { kind: 'character', key: t.key }
            : { kind: 'weapon', key: t.key, owner: t.owner },
        ),
      )
    }
  }
  for (const c of r.characters)
    ops.push(upsert({ kind: 'character', key: c.key, target: c.target }))
  for (const w of r.weapons) {
    ops.push(upsert({ kind: 'weapon', key: w.key, owner: w.owner, target: w.target }))
  }
  emit('apply', ops)
}
</script>

<template>
  <UiModal :open="open" title="Import from Seelie" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors"
        :class="dragging ? 'border-accent bg-surface-overlay' : 'border-border-strong'"
        title="seelie.me → Settings → Export Account"
        @dragenter.prevent="dragging = true"
        @dragover.prevent
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <FileUp class="size-7 text-text-muted" aria-hidden="true" />
        <p v-if="fileName" class="max-w-full truncate font-mono text-sm">{{ fileName }}</p>
        <UiButton size="sm" @click="input?.click()">{{
          fileName ? 'Change' : 'Choose file'
        }}</UiButton>
        <input
          ref="input"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-label="Seelie export file"
          @change="onPick"
        />
      </div>

      <p v-if="failure" class="flex items-center gap-2 text-sm text-danger-text" role="alert">
        <TriangleAlert class="size-4" aria-hidden="true" />
        {{ failure }}
      </p>

      <template v-if="preview">
        <dl class="grid grid-cols-2 gap-2">
          <div
            v-for="row in [
              { label: 'Characters', data: preview.characters },
              { label: 'Weapons', data: preview.weapons },
            ]"
            :key="row.label"
            class="rounded-lg border border-border-default p-3"
          >
            <dt class="text-xs text-text-muted">{{ row.label }}</dt>
            <dd class="tabular font-mono text-xl font-semibold">
              {{ formatNumber(row.data.total) }}
            </dd>
            <dd class="text-xs text-text-secondary">
              {{ breakdown(row.data) }}
            </dd>
          </div>
        </dl>

        <div v-if="preview.unmapped.length" class="flex flex-col gap-1.5">
          <span class="text-xs text-text-muted">Skipped {{ preview.unmapped.length }}</span>
          <span class="flex flex-wrap gap-1">
            <UiBadge v-for="slug in preview.unmapped" :key="slug" tone="warning">{{
              slug
            }}</UiBadge>
          </span>
        </div>
        <p
          v-if="result?.clamped"
          class="text-xs text-text-muted"
          title="Targets above level 90 were set to 90"
        >
          Capped at 90: {{ result.clamped }}
        </p>

        <UiSwitch
          v-if="preview.dropped.length"
          v-model="replace"
          :label="`Replace (remove ${preview.dropped.length})`"
        />
      </template>
    </div>

    <template #footer>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :disabled="!canApply" :loading="saving" @click="apply">
        Import
      </UiButton>
    </template>
  </UiModal>
</template>
