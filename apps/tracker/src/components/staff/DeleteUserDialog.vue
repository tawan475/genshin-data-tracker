<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { formatBytes } from '@/lib/format'
import UserLink from './UserLink.vue'

/**
 * Deletes a user (or, from Settings, yourself) once their username is typed:
 * what goes with them, the box, a red button that wakes up on a match.
 */
const props = defineProps<{
  open: boolean
  user: { id: number; username: string } | null
  figures?: { accounts: number; snapshots: number; storedBytes: number }
  title?: string
  busy?: boolean
}>()
const emit = defineEmits<{ close: []; confirm: [typed: string] }>()
const typed = ref('')
const formId = useId()

watch(
  () => props.open,
  (open) => {
    if (open) typed.value = ''
  },
)

const matches = computed(
  () => !!props.user && typed.value.trim().toLowerCase() === props.user.username.toLowerCase(),
)

function submit() {
  if (matches.value) emit('confirm', typed.value.trim())
}
</script>

<template>
  <UiModal :open="open" :title="title ?? 'Delete user'" @close="emit('close')">
    <form v-if="user" :id="formId" class="flex flex-col gap-4" @submit.prevent="submit">
      <UserLink :user="user" plain />
      <div v-if="figures" class="grid grid-cols-3 gap-2">
        <UiStat label="Accounts" :value="figures.accounts" exact />
        <UiStat label="Snapshots" :value="figures.snapshots" />
        <UiStat label="Stored" :value="formatBytes(figures.storedBytes)" />
      </div>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text-secondary">
          Type <span class="font-code">{{ user.username }}</span> to delete
        </span>
        <UiInput v-model="typed" autocomplete="off" spellcheck="false" autofocus />
      </label>
      <span class="text-[0.8125rem] text-danger-text">Can't be undone</span>
    </form>
    <template #footer>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="danger" type="submit" :form="formId" :disabled="!matches" :loading="busy">
        {{ title ?? 'Delete user' }}
      </UiButton>
    </template>
  </UiModal>
</template>
