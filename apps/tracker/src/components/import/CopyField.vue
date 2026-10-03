<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import { copyText } from '@/data/import-setup'
import { useFeedback } from '@/stores/feedback'

/**
 * A value to paste elsewhere (a URL, a key), shown in full with a copy
 * button. A click selects the whole value for a manual copy. A `url` wraps
 * after its slashes and dots rather than mid-word.
 */
const props = defineProps<{ label: string; value: string; note?: string; url?: boolean }>()
const emit = defineEmits<{ copied: [] }>()
const feedback = useFeedback()
const id = useId()
const code = ref<HTMLElement>()
const copied = ref(false)
const parts = computed(() => (props.url ? props.value.split(/(?<=[/.])/) : [props.value]))
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  if (await copyText(props.value, code.value)) {
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 2000)
    feedback.toast({ tone: 'success', title: 'Copied' })
    emit('copied')
  } else {
    feedback.toast({ tone: 'danger', title: 'Copy failed', detail: 'Press Ctrl+C' })
  }
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    class="flex flex-col gap-1.5"
    role="group"
    :aria-labelledby="`${id}-label`"
    :aria-describedby="note ? `${id}-note` : undefined"
  >
    <span :id="`${id}-label`" class="text-sm font-medium text-text-secondary">{{ label }}</span>
    <div class="flex items-stretch gap-2">
      <div
        class="flex min-h-10 min-w-0 flex-1 items-center rounded-md border border-border-strong bg-surface-sunken px-3 py-2"
      >
        <code
          ref="code"
          class="min-w-0 font-code text-sm text-text-primary select-all"
          :class="url ? 'wrap-break-word' : 'break-all'"
          ><template v-for="(part, index) in parts" :key="index"
            ><wbr v-if="index > 0" />{{ part }}</template
          ></code
        >
      </div>
      <UiButton
        :aria-label="`Copy ${label.toLowerCase()}`"
        :title="`Copy ${label.toLowerCase()}`"
        @click="copy"
      >
        <Check v-if="copied" class="size-4 text-success-text" aria-hidden="true" />
        <Copy v-else class="size-4" aria-hidden="true" />
      </UiButton>
    </div>
    <p v-if="note" :id="`${id}-note`" class="text-sm text-warning-text">{{ note }}</p>
  </div>
</template>
