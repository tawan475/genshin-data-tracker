<script setup lang="ts">
import { computed } from 'vue'
import { CalendarRange, X } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'

/**
 * Date filter for the table (local days, inclusive; either end open). While
 * it is set, "Select" replaces the selection with every snapshot in range.
 */
defineProps<{
  /** First and last capture day ("YYYY-MM-DD"), to bound the inputs. */
  firstDay: string
  lastDay: string
  /** Snapshots in range. */
  matched: number
}>()
const emit = defineEmits<{ select: [] }>()

const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })
const active = computed(() => from.value !== '' || to.value !== '')

function clear() {
  from.value = ''
  to.value = ''
}

const input =
  'min-w-0 flex-1 sm:flex-none sm:w-36 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors'
</script>

<template>
  <form
    class="flex w-full flex-wrap items-center gap-2 sm:w-auto"
    aria-label="Filter by date"
    @submit.prevent="emit('select')"
  >
    <div class="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
      <CalendarRange
        class="hidden size-4 shrink-0 text-slate-400 dark:text-slate-500 sm:block"
        aria-hidden="true"
      />
      <input
        v-model="from"
        type="date"
        aria-label="From"
        title="From"
        :min="firstDay"
        :max="to || lastDay"
        :class="input"
      />
      <span class="text-slate-400 dark:text-slate-500" aria-hidden="true">–</span>
      <input
        v-model="to"
        type="date"
        aria-label="To"
        title="To"
        :min="from || firstDay"
        :max="lastDay"
        :class="input"
      />
    </div>
    <template v-if="active">
      <BaseButton
        type="submit"
        variant="primary"
        size="sm"
        :disabled="matched === 0"
        :title="`Select the ${matched} snapshots in range`"
      >
        Select {{ matched }}
      </BaseButton>
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
        aria-label="Clear dates"
        title="Clear dates"
        @click="clear"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </template>
  </form>
</template>
