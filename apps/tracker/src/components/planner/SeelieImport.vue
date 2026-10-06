<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { raiseForTalents } from '@gdt/game-data/planner-goals'
import { findCharacterState, findWeaponState } from '@gdt/game-data/planner-math'
import { isSeelieExport, mapSeelieGoals, type SeelieImport } from '@/data/seelie'
import type { Good, PlannerTarget } from '@gdt/shared'
import { computed, ref, shallowRef, watch } from 'vue'
import { FileUp, TriangleAlert } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { formatNumber } from '@/lib/format'
import { characterGoalId, itemGoalId, newGoalId, refOf, targetId, weaponGoalId } from './model'
import { mapSeelieItems, matchWeaponGoals, type SeelieItems } from './seelie-items'
import { remove, upsert } from './use-planner-targets'

type Op = ReturnType<typeof upsert> | ReturnType<typeof remove>

/**
 * Goals from a Seelie export: pick or drop the file, see what it maps to
 * (new / changed / same, and what could not be mapped), then apply it as
 * one request. Extra item needs (`custom_items`) come along. "Replace" also
 * removes goals the file does not have. Weapon goals are matched to the
 * stored ones of the same weapon and owner in order (`matchWeaponGoals`),
 * so the same file twice changes nothing.
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
const extra = shallowRef<SeelieItems | null>(null)
const replace = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    fileName.value = ''
    failure.value = ''
    result.value = null
    extra.value = null
    replace.value = false
  },
)

async function read(file: File | undefined) {
  if (!file) return
  fileName.value = file.name
  failure.value = ''
  result.value = null
  extra.value = null
  try {
    const json: unknown = JSON.parse(await file.text())
    if (!isSeelieExport(json)) throw new Error('Not a Seelie export')
    const mapped = mapSeelieGoals(json, props.planner, {
      character: (key) => findCharacterState(props.good.characters, key).state,
      refinement: (key, owner) => findWeaponState(props.good.weapons, key, owner).state.refinement,
    })
    // Seelie allows talents its ascension can't reach; raise the ascension for them.
    result.value = {
      ...mapped,
      characters: mapped.characters.map((c) => {
        const phases = props.planner.characters.get(c.key)?.ascension
        return phases
          ? {
              ...c,
              target: raiseForTalents(phases, c.target, props.planner.talentAscension).target,
            }
          : c
      }),
    }
    extra.value = mapSeelieItems(json, props.planner)
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

/**
 * What the import writes. Notes, favorites and priorities are the tracker's
 * own, and an item need keeps its note and on/off state: those stay as stored.
 */
const plan = computed(() => {
  const r = result.value
  if (!r) return null
  const at = (id: string) => existing.value.get(id)
  const characters = r.characters.map((c) => {
    const now = at(characterGoalId(c.key))
    const keep = now?.kind === 'character' ? now.target : null
    const own = {
      note: keep?.note,
      favorite: keep?.favorite,
      priority: keep?.priority,
      constellation: keep?.constellation,
    }
    return { key: c.key, target: { ...c.target, ...own } }
  })
  const stored = props.targets.flatMap((t) => (t.kind === 'weapon' ? [t] : []))
  const ids = matchWeaponGoals(r.weapons, stored)
  const weapons = r.weapons.map((w, i) => {
    const id = ids[i] ?? newGoalId()
    const now = at(weaponGoalId(w.key, w.owner, id))
    const keep = now?.kind === 'weapon' ? now.target : null
    return {
      id,
      key: w.key,
      owner: w.owner,
      target: { ...w.target, note: keep?.note, priority: keep?.priority },
    }
  })
  const items = (extra.value?.items ?? []).map((i) => {
    const now = at(itemGoalId(i.key))
    const keep = now?.kind === 'item' ? now.target : null
    return {
      key: i.key,
      target: { count: i.count, active: keep?.active ?? true, note: keep?.note },
    }
  })
  return { characters, weapons, items }
})

const preview = computed(() => {
  const r = result.value
  const x = plan.value
  if (!r || !x) return null
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
  const characters = x.characters.map((c) => ({ id: characterGoalId(c.key), target: c.target }))
  const weapons = x.weapons.map((w) => ({
    id: weaponGoalId(w.key, w.owner, w.id),
    target: w.target,
  }))
  const items = x.items.map((i) => ({ id: itemGoalId(i.key), target: i.target }))
  const incoming = new Set([...characters, ...weapons, ...items].map((t) => t.id))
  return {
    characters: count(characters),
    weapons: count(weapons),
    items: count(items),
    dropped: props.targets.filter((t) => !incoming.has(targetId(t))),
    unmapped: [...r.unmapped.characters, ...r.unmapped.weapons, ...(extra.value?.unmapped ?? [])],
  }
})

/** The preview tiles; Items only when the file has extra item needs. */
const rows = computed(() => {
  const p = preview.value
  if (!p) return []
  const list = [
    { label: 'Characters', data: p.characters },
    { label: 'Weapons', data: p.weapons },
  ]
  if (p.items.total > 0) list.push({ label: 'Items', data: p.items })
  return list
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
  const changes = [p.characters, p.weapons, p.items].reduce((n, x) => n + x.added + x.changed, 0)
  return changes > 0 || (replace.value && p.dropped.length > 0)
})

function apply() {
  const x = plan.value
  const p = preview.value
  if (!x || !p) return
  const ops: Op[] = []
  if (replace.value) {
    for (const t of p.dropped) ops.push(remove(refOf(t)))
  }
  for (const c of x.characters) ops.push(upsert({ kind: 'character', ...c }))
  for (const w of x.weapons) ops.push(upsert({ kind: 'weapon', ...w }))
  for (const i of x.items) ops.push(upsert({ kind: 'item', ...i }))
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
        <dl class="grid grid-cols-2 gap-2" :class="rows.length > 2 ? 'sm:grid-cols-3' : ''">
          <div
            v-for="row in rows"
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
