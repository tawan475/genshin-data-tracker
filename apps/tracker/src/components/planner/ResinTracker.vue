<script setup lang="ts">
import type { ManualResin } from '@gdt/shared'
import { computed, ref, shallowRef, watch } from 'vue'
import { Bell, BellOff, BellRing, Pencil } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import { materialIcon } from '@/lib/assets'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import {
  RESIN_LIMIT,
  RESIN_MAX,
  alertAt,
  formatStep,
  fullAt,
  nextMark,
  resinAt,
  setResin,
  stepResin,
  type ResinReading,
} from './resin'
import { readStorage, writeStorage } from '@/lib/storage'
import {
  ALERT_AMOUNTS,
  alertSupport,
  askAlertPermission,
  scheduleResinAlert,
  type AlertSupport,
} from './resin-alerts'
import { formatSpan } from './tasks'

/**
 * Original Resin now: the newest reading (a capture's, or one set here)
 * plus regeneration. The number sets it by hand, the quick buttons add or
 * spend (the regeneration clock keeps running), the bell notifies this
 * device at a chosen amount while the site is open. A hand-set value stays
 * until a capture reads resin after it.
 */
const props = defineProps<{
  reading: ResinReading | null
  /** Condensed Resin held, and the most one can hold (0: unknown). */
  condensed: number
  condensedMax: number
  steps: readonly number[]
  now: number
  accountId: number
  accountName: string
  /** The page a notification opens. */
  url: string
}>()
const emit = defineEmits<{ set: [value: ManualResin | null] }>()

const current = computed(() => (props.reading ? resinAt(props.reading, props.now) : null))
const full = computed(() => (props.reading ? fullAt(props.reading, props.now) : null))
const mark = computed(() => (props.reading ? nextMark(props.reading, props.now) : null))
const SOURCE = {
  manual: 'set by hand',
  player: 'irminsul, at login',
  inventory: 'the snapshot',
} as const
const readingTitle = computed(() => {
  const r = props.reading
  if (!r) return 'Original Resin: not known yet · set it'
  return `Original Resin ~${formatNumber(current.value ?? 0)}/${RESIN_MAX} · ${formatNumber(r.value)} from ${SOURCE[r.source]}, ${formatDateTime(r.at)} · +1 every 8 minutes`
})

function canStep(step: number) {
  return (current.value ?? 0) + step >= 0 && (current.value ?? 0) + step <= RESIN_LIMIT
}
function applyStep(step: number) {
  const next = stepResin(props.reading, step, Date.now())
  if (next) emit('set', next)
}

// ------------------------------------------------------------ set by hand

const editAnchor = ref<HTMLElement | null>(null)
const editing = ref(false)
const typed = ref('')
const invalid = ref(false)

function openEdit(event: Event) {
  editAnchor.value = event.currentTarget as HTMLElement
  typed.value = current.value === null ? '' : String(current.value)
  invalid.value = false
  editing.value = true
}

function commitEdit() {
  const text = String(typed.value ?? '').trim()
  const value = Number(text)
  if (text === '' || !Number.isInteger(value) || value < 0 || value > RESIN_LIMIT) {
    invalid.value = true
    return
  }
  emit('set', setResin(props.reading, value, Date.now()))
  editing.value = false
}

function useCapture() {
  emit('set', null)
  editing.value = false
}

// ------------------------------------------------------------ alert

/** The amount this device alerts at for an account (null: off). */
function alertAmount(accountId: number): number | null {
  const raw = Number(readStorage(`planner:resin-alert:${accountId}`))
  return Number.isInteger(raw) && raw > 0 && raw <= RESIN_LIMIT ? raw : null
}
function setAlertAmount(accountId: number, value: number | null) {
  writeStorage(`planner:resin-alert:${accountId}`, value === null ? null : String(value))
}

const support = shallowRef<AlertSupport>(alertSupport())
const amount = ref<number | null>(alertAmount(props.accountId))
watch(
  () => props.accountId,
  (id) => (amount.value = alertAmount(id)),
)
const alertAnchor = ref<HTMLElement | null>(null)
const alertOpen = ref(false)

function openAlert(event: Event) {
  alertAnchor.value = event.currentTarget as HTMLElement
  support.value = alertSupport()
  alertOpen.value = true
}

async function chooseAlert(value: number | null) {
  if (value !== null && support.value !== 'granted') {
    support.value = await askAlertPermission()
    if (support.value !== 'granted') return
  }
  amount.value = value
  setAlertAmount(props.accountId, value)
  alertOpen.value = false
}

const alertOn = computed(() => amount.value !== null && support.value === 'granted')
const alertWhen = computed(() =>
  alertOn.value ? alertAt(props.reading, amount.value!, props.now) : null,
)
const alertTitle = computed(() => {
  if (support.value === 'unsupported') return 'Resin alert: not supported in this browser'
  if (!alertOn.value) return 'Resin alert: off'
  const when = alertWhen.value
  return `Resin alert at ${amount.value}${when ? `, ${formatTime(when)}` : ''} · while the site is open`
})

// Rescheduled when the reading or the amount changes (not every clock tick).
watch(
  () =>
    [
      props.accountId,
      props.reading?.value,
      props.reading?.at,
      amount.value,
      support.value,
    ] as const,
  () => {
    const at = alertOn.value ? alertAt(props.reading, amount.value!, Date.now()) : null
    scheduleResinAlert(props.accountId, at, amount.value ?? 0, {
      name: props.accountName,
      url: props.url,
    })
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border-default bg-surface-raised px-3 py-2 shadow-sm"
    aria-label="Original Resin"
  >
    <div class="flex w-full items-center gap-2 sm:w-auto">
      <span class="size-8 shrink-0">
        <MaterialIcon :src="materialIcon('OriginalResin')" name="Original Resin" />
      </span>
      <button
        type="button"
        class="group tabular inline-flex items-baseline gap-1 rounded-md px-1 font-mono transition-colors hover:bg-surface-overlay"
        :title="readingTitle"
        :aria-label="`${readingTitle}. Set`"
        @click="openEdit"
      >
        <span
          class="text-2xl leading-8 font-semibold"
          :class="(current ?? 0) >= RESIN_MAX ? 'text-warning-text' : ''"
          >{{ current === null ? '–' : formatNumber(current) }}</span
        >
        <span class="text-sm text-text-muted">/{{ RESIN_MAX }}</span>
        <Pencil
          class="size-3.5 self-center text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </button>
      <span class="ml-auto flex shrink-0 gap-1 sm:ml-2">
        <UiButton
          v-for="step in steps"
          :key="step"
          size="sm"
          class="tabular min-w-12 font-mono"
          :disabled="!canStep(step)"
          :title="`${step < 0 ? 'Spend' : 'Add'} ${Math.abs(step)}`"
          @click="applyStep(step)"
          >{{ formatStep(step) }}</UiButton
        >
      </span>
    </div>
    <p
      class="tabular flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary"
    >
      <span v-if="full" class="inline-flex gap-1.5" :title="`Full at ${formatDateTime(full)}`">
        <span class="text-text-muted">Full</span>
        <time class="font-mono text-text-primary" :datetime="new Date(full).toISOString()">{{
          formatTime(full)
        }}</time>
        <span class="font-mono text-text-muted">· {{ formatSpan(full - now) }}</span>
      </span>
      <span v-else-if="current !== null" class="font-medium text-warning-text">Full</span>
      <span
        v-if="mark && mark.amount < RESIN_MAX"
        class="inline-flex gap-1 font-mono"
        :title="`${mark.amount} at ${formatTime(mark.at)}`"
      >
        <span class="text-text-primary">{{ mark.amount }}</span>
        <span class="font-sans text-text-muted">in</span>
        {{ formatSpan(mark.at - now) }}
      </span>
      <span class="inline-flex items-center gap-1 font-mono" title="Condensed Resin">
        <span class="size-5 shrink-0">
          <MaterialIcon :src="materialIcon('CondensedResin')" name="Condensed Resin" />
        </span>
        <span
          >{{ formatNumber(condensed)
          }}<span v-if="condensedMax" class="text-text-muted">/{{ condensedMax }}</span></span
        >
        <span class="sr-only">Condensed Resin</span>
      </span>
    </p>
    <button
      type="button"
      class="-my-1 ml-auto inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm transition-colors hover:bg-surface-overlay hover:text-text-primary"
      :class="alertOn ? 'text-accent-text' : 'text-text-muted'"
      :title="alertTitle"
      :aria-label="alertTitle"
      :aria-pressed="alertOn"
      @click="openAlert"
    >
      <BellRing v-if="alertOn" class="size-4" aria-hidden="true" />
      <BellOff
        v-else-if="support === 'denied' || support === 'unsupported'"
        class="size-4"
        aria-hidden="true"
      />
      <Bell v-else class="size-4" aria-hidden="true" />
      <span v-if="alertOn" class="tabular font-mono text-xs">{{ amount }}</span>
    </button>

    <UiPopover :open="editing" :anchor="editAnchor" label="Original Resin" @close="editing = false">
      <form class="flex flex-col gap-3 p-4" @submit.prevent="commitEdit">
        <div class="flex items-center gap-2">
          <UiInput
            v-model="typed"
            type="number"
            inputmode="numeric"
            min="0"
            :max="RESIN_LIMIT"
            mono
            autofocus
            class="w-28"
            aria-label="Original Resin now"
            :invalid="invalid"
          />
          <span class="text-sm text-text-muted">/{{ RESIN_MAX }}</span>
          <UiButton type="submit" variant="primary" size="sm" class="ml-auto">Set</UiButton>
        </div>
        <UiButton v-if="reading?.source === 'manual'" size="sm" variant="ghost" @click="useCapture">
          Back to the capture
        </UiButton>
      </form>
    </UiPopover>

    <UiPopover
      :open="alertOpen"
      :anchor="alertAnchor"
      label="Resin alert"
      @close="alertOpen = false"
    >
      <div class="flex flex-col gap-3 p-4 text-sm">
        <p v-if="support === 'unsupported'" class="text-text-secondary">
          Not supported in this browser
        </p>
        <template v-else>
          <p v-if="support === 'denied'" class="text-danger-text" role="alert">
            Blocked: allow notifications for this site in the browser's settings
          </p>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Notify at">
            <UiButton
              v-for="a in ALERT_AMOUNTS"
              :key="a"
              size="sm"
              class="tabular min-w-12 font-mono"
              :variant="alertOn && amount === a ? 'primary' : 'secondary'"
              :aria-pressed="alertOn && amount === a"
              :disabled="support === 'denied'"
              @click="chooseAlert(a)"
              >{{ a }}</UiButton
            >
            <UiButton size="sm" variant="ghost" :aria-pressed="!alertOn" @click="chooseAlert(null)"
              >Off</UiButton
            >
          </div>
          <p class="text-xs text-text-muted">While the site is open on this device</p>
        </template>
      </div>
    </UiPopover>
  </section>
</template>
