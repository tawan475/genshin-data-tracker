<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UserLink from './UserLink.vue'

/**
 * A staff action with a note for the audit log (Suspend, Block uploads):
 * who it is for, what it does in a few lines, the reason, and the button.
 */
const props = defineProps<{
  open: boolean
  title: string
  user: { id: number; username: string } | null
  /** What happens, one short line each. */
  effects: string[]
  confirmLabel: string
  busy?: boolean
}>()
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()
const reason = ref('')
const reasonId = useId()

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = ''
  },
)
</script>

<template>
  <UiModal :open="open" :title="title" @close="emit('close')">
    <form
      :id="`${reasonId}-form`"
      class="flex flex-col gap-4"
      @submit.prevent="emit('confirm', reason.trim())"
    >
      <UserLink v-if="user" :user="user" plain />
      <div class="flex flex-col gap-1.5">
        <label :for="reasonId" class="text-sm font-medium text-text-secondary">Reason</label>
        <textarea
          :id="reasonId"
          v-model="reason"
          maxlength="500"
          rows="3"
          autofocus
          class="w-full resize-y rounded-md border border-border-strong bg-surface-raised px-3 py-2.5 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          placeholder="For the audit log"
        />
      </div>
      <ul class="flex flex-col divide-y divide-border-subtle text-sm">
        <li v-for="line in effects" :key="line" class="flex items-center gap-2.5 py-2">
          <Check class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          {{ line }}
        </li>
      </ul>
    </form>
    <template #footer>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="danger" type="submit" :form="`${reasonId}-form`" :loading="busy">
        {{ confirmLabel }}
      </UiButton>
    </template>
  </UiModal>
</template>
