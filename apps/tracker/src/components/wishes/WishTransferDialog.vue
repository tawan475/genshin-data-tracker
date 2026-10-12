<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Download, FileJson, FileUp, Trash2 } from 'lucide-vue-next'
import {
  WISH_SITE_IMPORT_MAX_RECORDS,
  buildPaimonCsv,
  buildUigf,
  parseWishFile,
  type AccountResponse,
  type WishFile,
  type WishFileAccount,
} from '@gdt/shared'
import { api } from '@/api'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import type { WishHistory } from '@/data/wish-history'
import { saveBlob } from '@/data/export'
import { formatNumber } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'

/**
 * Wish history in and out: import a UIGF v4 JSON (or older UIGF), a
 * paimon.moe CSV (its Local Importer's format) or paimon.moe's own backup;
 * export UIGF v4 or that CSV; delete the history. Files are read and
 * written in the browser; an import sends the records (merged by id on the
 * server, so a file overlapping what is held only adds what is new).
 */
const props = defineProps<{
  open: boolean
  account: AccountResponse
  history: WishHistory | undefined
  readOnly: boolean
}>()
const emit = defineEmits<{ close: []; changed: [] }>()
const feedback = useFeedback()

const FORMAT_LABELS: Record<WishFile['format'], string> = {
  uigf: 'UIGF',
  'paimon-csv': 'paimon.moe CSV',
  'paimon-backup': 'paimon.moe backup',
}

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const reading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const fileName = ref('')
const failure = ref('')
const file = shallowRef<WishFile | null>(null)

const uid = computed(() => props.account.uid?.trim() || null)

/**
 * Which of the file's accounts to import (paimon.moe backups can hold
 * several): the one with this account's UID, the only one, or the user's
 * pick. Another UID's history is never imported into this account.
 */
const picked = ref<number | null>(null)
watch(file, (f) => {
  const accounts = f?.accounts ?? []
  const same = accounts.findIndex((a) => a.uid && a.uid === uid.value)
  picked.value = same >= 0 ? same : accounts.length === 1 ? 0 : null
})
const entry = computed<WishFileAccount | null>(() =>
  picked.value === null ? null : (file.value?.accounts[picked.value] ?? null),
)
const mismatch = computed(() => {
  const e = entry.value
  if (!file.value) return ''
  if (file.value.accounts.length === 0) return 'No records'
  if (e?.uid && uid.value && e.uid !== uid.value) {
    return `That history is UID ${e.uid}; this account is UID ${uid.value}`
  }
  return ''
})
const accountLabel = (a: WishFileAccount, i: number) =>
  a.uid ? `UID ${a.uid}` : `Account ${i + 1}`

function reset() {
  fileName.value = ''
  failure.value = ''
  file.value = null
  dragging.value = false
}
watch(
  () => props.open,
  (open) => open && reset(),
)

async function read(picked: File | undefined) {
  if (!picked) return
  reset()
  fileName.value = picked.name
  reading.value = true
  try {
    file.value = parseWishFile(await picked.text())
  } catch {
    failure.value = 'Not a UIGF or paimon.moe file'
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

async function importFile() {
  const source = entry.value
  if (!source || props.readOnly) return
  const id = props.account.id
  saving.value = true
  let added = 0
  let known = 0
  try {
    for (let i = 0; i < source.records.length; i += WISH_SITE_IMPORT_MAX_RECORDS) {
      const answer = await api.importWishes(id, {
        ...(source.uid ? { uid: source.uid } : {}),
        ...(source.timezone !== null ? { timezone: source.timezone } : {}),
        records: source.records.slice(i, i + WISH_SITE_IMPORT_MAX_RECORDS),
      })
      added += answer.added
      known += answer.known
    }
    feedback.toast({
      tone: 'success',
      title: added > 0 ? `${formatNumber(added)} new pulls` : 'Nothing new',
      hint: `${formatNumber(known)} already held`,
    })
    emit('changed')
    emit('close')
  } catch (error) {
    feedback.error('Not imported', error)
    if (added > 0) emit('changed')
  } finally {
    saving.value = false
  }
}

const pulls = computed(() => (props.history ? [...props.history.banners.values()].flat() : []))
const stamp = () => new Date().toISOString().slice(0, 10)
const fileUid = () => uid.value ?? `account${props.account.id}`

function exportUigf() {
  const history = props.history
  if (!history) return
  const json = buildUigf(
    [{ uid: uid.value ?? '', timezone: history.timezone, pulls: pulls.value }],
    { name: 'Genshin Tracker', version: '1' },
  )
  saveBlob(
    new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
    `wishes-uigf-${fileUid()}-${stamp()}.json`,
  )
}

function exportPaimon() {
  saveBlob(
    new Blob([buildPaimonCsv(pulls.value)], { type: 'text/csv' }),
    `wishes-paimonmoe-${fileUid()}-${stamp()}.csv`,
  )
}

async function remove() {
  const ok = await feedback.confirm({
    title: 'Delete wish history?',
    detail: `All ${formatNumber(pulls.value.length)} pulls of this account are removed. irminsul can fetch the last six months again.`,
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return
  deleting.value = true
  try {
    await api.deleteWishes(props.account.id)
    emit('changed')
    emit('close')
  } catch (error) {
    feedback.error('Not deleted', error)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UiModal :open="open" title="Import / export" @close="emit('close')">
    <div class="flex flex-col gap-5">
      <section v-if="!readOnly" class="flex flex-col gap-3" aria-label="Import">
        <div
          class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors"
          :class="dragging ? 'border-accent bg-surface-overlay' : 'border-border-strong'"
          title="UIGF JSON (Snap Hutao, Starward, genshin-wish-export…), a paimon.moe importer CSV, or paimon.moe's backup (Settings → Export)"
          @dragenter.prevent="dragging = true"
          @dragover.prevent
          @dragleave.self="dragging = false"
          @drop.prevent="onDrop"
        >
          <FileUp class="size-8 text-text-muted" aria-hidden="true" />
          <p class="text-sm font-medium">UIGF or paimon.moe file</p>
          <UiButton :loading="reading" @click="input?.click()">Browse</UiButton>
          <input
            ref="input"
            type="file"
            accept=".json,.csv,application/json,text/csv"
            class="hidden"
            tabindex="-1"
            aria-hidden="true"
            @change="onPick"
          />
        </div>

        <div v-if="fileName" class="flex flex-col gap-2" aria-live="polite">
          <p class="flex min-w-0 items-center gap-2 text-sm">
            <FileJson class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span class="truncate font-medium">{{ fileName }}</span>
            <span v-if="file" class="shrink-0 text-text-muted">{{
              FORMAT_LABELS[file.format]
            }}</span>
          </p>
          <div
            v-if="file && file.accounts.length > 1"
            role="radiogroup"
            aria-label="Account in the file"
            class="flex flex-wrap gap-2"
          >
            <FilterChip
              v-for="(a, i) in file.accounts"
              :key="i"
              radio
              :pressed="picked === i"
              :count="a.records.length"
              @toggle="picked = i"
              >{{ accountLabel(a, i) }}</FilterChip
            >
          </div>
          <p v-if="failure || mismatch" class="text-sm text-danger-text" role="alert">
            {{ failure || mismatch }}
          </p>
          <p v-else-if="entry" class="tabular font-mono text-sm text-text-secondary">
            {{ formatNumber(entry.records.length) }} pulls{{
              entry.uid ? ` · UID ${entry.uid}` : ''
            }}
          </p>
        </div>
        <UiButton
          v-if="entry && !mismatch"
          variant="primary"
          :loading="saving"
          :disabled="entry.records.length === 0"
          @click="importFile"
          >Import</UiButton
        >
      </section>

      <section class="flex flex-col gap-2" aria-label="Export">
        <h3 class="text-sm font-semibold">Export</h3>
        <div class="flex flex-wrap gap-2">
          <UiButton
            :disabled="pulls.length === 0"
            title="UIGF v4.1: Snap Hutao, Starward and most wish trackers read it"
            @click="exportUigf"
          >
            <Download class="size-4" aria-hidden="true" />UIGF
          </UiButton>
          <UiButton
            :disabled="pulls.length === 0"
            title="For paimon.moe's Local Importer (Wish counter → Import → Local)"
            @click="exportPaimon"
          >
            <Download class="size-4" aria-hidden="true" />paimon.moe CSV
          </UiButton>
        </div>
      </section>

      <section v-if="!readOnly && pulls.length > 0" class="flex flex-col gap-2" aria-label="Delete">
        <UiButton variant="ghost" :loading="deleting" class="self-start" @click="remove">
          <span class="inline-flex items-center gap-1.5 text-danger-text"
            ><Trash2 class="size-4" aria-hidden="true" />Delete history</span
          >
        </UiButton>
      </section>
    </div>
  </UiModal>
</template>
