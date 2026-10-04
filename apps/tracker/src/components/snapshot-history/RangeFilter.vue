<script setup lang="ts">
import { computed } from 'vue'
import { CalendarRange, X } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'

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
  'min-h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-text-primary shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none sm:w-36 sm:flex-none'
</script>

<template>
  <form
    class="flex w-full flex-wrap items-center gap-2 sm:w-auto"
    aria-label="Filter by date"
    @submit.prevent="emit('select')"
  >
    <div class="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
      <CalendarRange class="hidden size-4 shrink-0 text-text-muted sm:block" aria-hidden="true" />
      <input
        v-model="from"
        type="date"
        aria-label="From"
        title="From"
        :min="firstDay"
        :max="to || lastDay"
        :class="input"
      />
      <span class="text-text-muted" aria-hidden="true">–</span>
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
      <UiButton
        type="submit"
        variant="primary"
        size="sm"
        :disabled="matched === 0"
        :title="`Select the ${matched} snapshots in range`"
      >
        Select {{ matched }}
      </UiButton>
      <UiIconButton label="Clear dates" @click="clear">
        <X class="size-5" aria-hidden="true" />
      </UiIconButton>
    </template>
  </form>
</template>
