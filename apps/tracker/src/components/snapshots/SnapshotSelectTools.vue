<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarRange } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import { formatNumber } from '@/lib/format'

/**
 * Selection helpers above the list: everything on screen, or every snapshot
 * between two dates (inclusive, local days; shown or not). An empty date
 * means the first or last capture.
 */
const props = defineProps<{
  /** Rows on screen, and how many of them are selected. */
  shown: number
  shownSelected: number
  /** First and last capture day ("YYYY-MM-DD"), to bound the date inputs. */
  firstDay: string
  lastDay: string
  /** Replaces the selection with the range; returns how many matched. */
  selectRange: (from: string, to: string) => number
}>()
const emit = defineEmits<{ selectShown: [select: boolean] }>()

const from = ref('')
const to = ref('')
const problem = ref('')

watch([from, to], () => (problem.value = ''))

const allShown = computed(() => props.shown > 0 && props.shownSelected === props.shown)
const someShown = computed(() => props.shownSelected > 0 && !allShown.value)

function submit() {
  const start = from.value || props.firstDay
  const end = to.value || props.lastDay
  if (start > end) {
    problem.value = 'Start is after end'
    return
  }
  if (props.selectRange(start, end) === 0) problem.value = 'No snapshots in range'
}
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-2 py-3 md:px-3">
    <label
      class="flex min-h-11 cursor-pointer items-center gap-3 pr-2"
      :title="`Select the ${formatNumber(shown)} snapshots on screen`"
    >
      <span class="inline-flex size-11 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          class="size-5 cursor-pointer accent-accent"
          :checked="allShown"
          :indeterminate="someShown"
          :disabled="shown === 0"
          @change="emit('selectShown', !allShown)"
        />
      </span>
      <span>
        Select shown
        <span class="tabular font-mono text-text-muted">{{ formatNumber(shown) }}</span>
      </span>
    </label>

    <form
      class="grid w-full grid-cols-2 items-end gap-2 px-2 sm:flex sm:w-auto sm:flex-wrap md:px-0"
      aria-label="Select by date"
      @submit.prevent="submit"
    >
      <UiField v-slot="{ id }" label="From" class="sm:w-40">
        <UiInput :id="id" v-model="from" type="date" :min="firstDay" :max="lastDay" />
      </UiField>
      <UiField v-slot="{ id }" label="To" class="sm:w-40">
        <UiInput :id="id" v-model="to" type="date" :min="firstDay" :max="lastDay" />
      </UiField>
      <UiButton type="submit" class="col-span-2" title="Select every snapshot in these dates">
        <CalendarRange class="size-4" aria-hidden="true" />
        Select
      </UiButton>
      <p class="col-span-2 text-sm text-danger-text sm:basis-full" role="status">
        {{ problem }}
      </p>
    </form>
  </div>
</template>
