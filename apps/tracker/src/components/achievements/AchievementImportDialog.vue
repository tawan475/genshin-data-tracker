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
} from '@/data/achievement-progress'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { pickPaimonAccount } from '@/data/paimon-backup'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'

/**
 * Marks achievements done from another tracker's file: a Seelie account
 * export, a paimon.moe backup (one of its accounts: this account's UID, else
 * the user's pick) or a GOOD file with `gi_achievements` (stardb, irminsul).
 * Only ids not already done are added.
 */
const props = defineProps<{
  open: boolean
  /** This account's UID (picks the paimon.moe account with it). */
  uid?: string | null
  state: DoneState
  known: ReadonlyMap<number, Achievement>
  /** Saves the marks; resolves false when that failed. */
  save: (ids: number[]) => Promise<boolean>
}>()
const emit = defineEmits<{ close: [] }>()

const formatLabel = (format: ParsedAchievementImport['format']): string =>
  format === 'seelie'
    ? 'Seelie'
    : format === 'paimon'
      ? 'paimon.moe'
      : format === 'good'
        ? 'Leyline/GOOD'
        : t('achievements.import.formats.list')

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const reading = ref(false)
const saving = ref(false)
const fileName = ref('')
const failure = ref('')
const parsed = shallowRef<ParsedAchievementImport | null>(null)
/** paimon.moe: which of the file's accounts. */
const picked = ref(0)
const ids = computed(() => parsed.value?.accounts?.[picked.value]?.ids ?? parsed.value?.ids ?? [])

const plan = computed<AchievementImportPlan | null>(() =>
  parsed.value ? planAchievementImport(ids.value, props.state, props.known) : null,
)
const accountLabel = (a: { value: string; uid: string | null }, i: number) =>
  a.uid ? `UID ${a.uid}` : t('achievements.import.account', { n: i + 1 })

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
    if (result) {
      picked.value = result.accounts ? pickPaimonAccount(result.accounts, props.uid) : 0
      parsed.value = result
    } else failure.value = t('achievements.import.noAchievements')
  } catch {
    failure.value = t('achievements.import.notJson')
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
  <UiModal :open="open" :title="$t('achievements.import.title')" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors"
        :class="dragging ? 'border-accent bg-surface-overlay' : 'border-border-strong'"
        :title="$t('achievements.import.dropTitle')"
        @dragenter.prevent="dragging = true"
        @dragover.prevent
        @dragleave.self="dragging = false"
        @drop.prevent="onDrop"
      >
        <FileUp class="size-8 text-text-muted" aria-hidden="true" />
        <p class="text-sm font-medium">{{ $t('achievements.import.drop') }}</p>
        <UiButton :loading="reading" @click="input?.click()">{{
          $t('achievements.import.browse')
        }}</UiButton>
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
            formatLabel(parsed.format)
          }}</span>
        </p>
        <div
          v-if="parsed?.accounts && parsed.accounts.length > 1"
          role="radiogroup"
          :aria-label="$t('achievements.import.fileAccount')"
          class="flex flex-wrap gap-2"
        >
          <FilterChip
            v-for="(a, i) in parsed.accounts"
            :key="a.prefix"
            radio
            :pressed="picked === i"
            :count="a.ids.length"
            @toggle="picked = i"
            >{{ accountLabel(a, i) }}</FilterChip
          >
        </div>
        <p v-if="failure" class="text-sm text-danger-text" role="alert">{{ failure }}</p>
        <dl v-else-if="plan && parsed" class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg bg-surface-overlay px-2 py-2">
            <dt class="text-xs text-text-muted">{{ $t('achievements.import.inFile') }}</dt>
            <dd class="tabular font-mono text-lg font-medium">
              {{ formatNumber(ids.length) }}
            </dd>
          </div>
          <div class="rounded-lg bg-surface-overlay px-2 py-2">
            <dt class="text-xs text-text-muted">{{ $t('achievements.import.already') }}</dt>
            <dd class="tabular font-mono text-lg font-medium">{{ formatNumber(plan.already) }}</dd>
          </div>
          <div
            class="rounded-lg bg-surface-overlay px-2 py-2"
            :title="
              plan.unknown || plan.disused
                ? $t('achievements.import.newTitle', {
                    unknown: formatNumber(plan.unknown),
                    disused: formatNumber(plan.disused),
                  })
                : undefined
            "
          >
            <dt class="text-xs text-text-muted">{{ $t('achievements.import.new') }}</dt>
            <dd class="tabular font-mono text-lg font-medium text-accent-text">
              {{ formatNumber(plan.add.length) }}
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <template #footer>
      <UiButton variant="ghost" @click="emit('close')">{{
        $t('achievements.import.cancel')
      }}</UiButton>
      <UiButton variant="primary" :disabled="!plan?.add.length" :loading="saving" @click="add">
        {{
          $t('achievements.import.add', {
            n: plan?.add.length ? formatNumber(plan.add.length) : '',
          })
        }}
      </UiButton>
    </template>
  </UiModal>
</template>
