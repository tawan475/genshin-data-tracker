<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AccountPlayer } from '@/data/account-player'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import type { PlannerOptions, PlannerOptionsPatch } from '@/data/planner-settings'

/**
 * The planner's account settings: Adventure Rank, World Level and two
 * options. Each change is saved as it is made (no Save button). AR and WL
 * left empty follow what irminsul read at the newest login, shown as the
 * placeholder.
 */
const props = defineProps<{ open: boolean; settings: PlannerOptions; player: AccountPlayer }>()

/** irminsul's value is in use: the setting is empty and a snapshot has one. */
const arFromPlayer = computed(() => props.settings.ar === null && props.player.ar !== null)
const wlFromPlayer = computed(() => props.settings.wl === null && props.player.wl !== null)
const emit = defineEmits<{ close: []; change: [patch: PlannerOptionsPatch] }>()

const ar = ref('')
const arInvalid = ref(false)
watch(
  () => [props.open, props.settings.ar] as const,
  ([open, value]) => {
    if (!open) return
    ar.value = value === null ? '' : String(value)
    arInvalid.value = false
  },
  { immediate: true },
)

function commitAr() {
  // A number input's v-model may hand back a number.
  const text = String(ar.value ?? '').trim()
  const value = text === '' ? null : Number(text)
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 60)) {
    arInvalid.value = true
    return
  }
  arInvalid.value = false
  if (value !== props.settings.ar) emit('change', { ar: value })
}

const wlOptions = computed<{ value: number | null; label: string }[]>(() => [
  { value: null, label: props.player.wl === null ? '–' : `Auto (${props.player.wl})` },
  ...Array.from({ length: 10 }, (_, i) => ({ value: i, label: String(i) })),
])

function setWl(value: number | null) {
  if (value !== props.settings.wl) emit('change', { wl: value })
}

function setOption(key: 'azoth' | 'passives', value: boolean) {
  emit('change', { planner: { [key]: value } })
}
</script>

<template>
  <UiModal :open="open" title="Planner settings" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <label
          class="flex min-w-0 flex-col gap-1"
          :title="`Adventure Rank (1–60)${player.ar === null ? '' : ` · ${player.ar} from irminsul`}`"
        >
          <span class="text-sm text-text-secondary">AR</span>
          <UiInput
            v-model="ar"
            type="number"
            inputmode="numeric"
            min="1"
            max="60"
            :placeholder="player.ar === null ? '–' : String(player.ar)"
            :invalid="arInvalid"
            @change="commitAr"
            @keydown.enter="commitAr"
          />
          <span v-if="arFromPlayer" class="text-xs text-text-muted">from irminsul</span>
        </label>
        <label
          class="flex min-w-0 flex-col gap-1"
          :title="`World Level (0–9)${player.wl === null ? '' : ` · ${player.wl} from irminsul`}`"
        >
          <span class="text-sm text-text-secondary">WL</span>
          <UiSelect
            :model-value="settings.wl"
            :options="wlOptions"
            aria-label="World Level"
            @update:model-value="setWl"
          />
          <span v-if="wlFromPlayer" class="text-xs text-text-muted">from irminsul</span>
        </label>
      </div>
      <div class="flex flex-col border-t border-border-subtle pt-2">
        <div title="Cover missing gems with spare gems of another element">
          <UiSwitch
            :model-value="settings.planner.azoth"
            label="Dust of Azoth"
            @update:model-value="setOption('azoth', $event)"
          />
        </div>
        <div title="Raiden Shogun, Wanderer: −50% Mora for weapon ascension">
          <UiSwitch
            :model-value="settings.planner.passives"
            label="Mora passives"
            @update:model-value="setOption('passives', $event)"
          />
        </div>
      </div>
    </div>
  </UiModal>
</template>
