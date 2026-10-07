<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { formatBytes } from '@/lib/format'

const MB = 1024 * 1024

/** One user's storage quota in MB, or back to the site's default. */
const props = defineProps<{
  open: boolean
  /** Their own quota in bytes; null: the default. */
  quota: number | null
  defaultQuota: number
  busy?: boolean
}>()
const emit = defineEmits<{ close: []; confirm: [bytes: number | null] }>()
const value = ref('')
const formId = useId()

watch(
  () => props.open,
  (open) => {
    if (open) value.value = String(Math.round((props.quota ?? props.defaultQuota) / MB))
  },
)

function submit() {
  const mb = Number(value.value)
  if (!Number.isFinite(mb) || mb < 0) return
  emit('confirm', Math.round(mb * MB))
}
</script>

<template>
  <UiModal :open="open" title="Storage quota" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-4" @submit.prevent="submit">
      <UiField
        v-slot="{ id, describedBy }"
        label="Quota (MB)"
        :hint="`Default ${formatBytes(defaultQuota)}`"
      >
        <UiInput
          :id="id"
          v-model="value"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          :aria-describedby="describedBy"
          autofocus
        />
      </UiField>
    </form>
    <template #footer>
      <UiButton
        v-if="quota !== null"
        variant="ghost"
        class="mr-auto"
        @click="emit('confirm', null)"
      >
        Use default
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :loading="busy">Save</UiButton>
    </template>
  </UiModal>
</template>
