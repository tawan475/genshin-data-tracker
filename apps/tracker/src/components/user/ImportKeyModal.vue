<script setup lang="ts">
import { computed, ref } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import BaseModal from '@/components/legacy/BaseModal.vue'
import { copyText } from '@/data/import-setup'
import { useFeedback } from '@/stores/feedback'

/**
 * The original "Import Key Generated" dialog. The server keeps only a hash,
 * so this is the one time the key can be read.
 */
const props = defineProps<{ importKey: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const feedback = useFeedback()
const code = ref<HTMLElement | null>(null)

const open = computed({
  get: () => props.importKey !== null,
  set: (value) => {
    if (!value) emit('close')
  },
})

async function copy() {
  if (!props.importKey) return
  if (await copyText(props.importKey, code.value)) {
    feedback.toast({ tone: 'success', title: 'Copied to clipboard!' })
    emit('close')
  } else {
    // The key stays selected for a manual copy.
    feedback.toast({ tone: 'danger', title: 'Copy failed', detail: 'Copy the key by hand.' })
  }
}
</script>

<template>
  <BaseModal v-model="open" title="Import Key Generated">
    <div class="p-6 text-center text-slate-700 dark:text-slate-300">
      <CircleCheck
        class="mx-auto mb-4 size-14 text-emerald-500"
        stroke-width="1.5"
        aria-hidden="true"
      />
      <div class="mb-2">Your new import key is:</div>
      <code
        ref="code"
        class="font-mono bg-slate-100 dark:bg-slate-700 p-2 rounded block select-all break-all text-slate-900 dark:text-slate-100 text-sm"
        >{{ importKey }}</code
      >
      <div class="text-xs text-amber-500 mt-2">This key will only be shown once!</div>
    </div>
    <div
      class="px-6 pb-6 pt-4 flex justify-center gap-3 border-t border-slate-200 dark:border-slate-700"
    >
      <BaseButton variant="primary" @click="copy">Copy to Clipboard</BaseButton>
    </div>
  </BaseModal>
</template>
