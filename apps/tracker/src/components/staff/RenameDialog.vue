<script setup lang="ts">
import { usernameSchema } from '@gdt/shared'
import { computed, ref, useId, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'

/** A new username (an offensive one, say), checked like sign-up's; a taken one comes back as `error`. */
const props = defineProps<{
  open: boolean
  user: { id: number; username: string } | null
  busy?: boolean
  error?: string
}>()
const emit = defineEmits<{ close: []; confirm: [username: string] }>()
const name = ref('')
const formId = useId()

watch(
  () => props.open,
  (open) => {
    if (open) name.value = props.user?.username ?? ''
  },
)

const invalid = computed(() =>
  usernameSchema.safeParse(name.value).success ? '' : '3–32 letters, digits, . - _',
)

function submit() {
  if (!invalid.value) emit('confirm', name.value.trim())
}
</script>

<template>
  <UiModal :open="open" title="Rename" @close="emit('close')">
    <form :id="formId" class="flex flex-col gap-4" @submit.prevent="submit">
      <UiField v-slot="{ id, describedBy }" label="Username" :error="invalid || error">
        <UiInput
          :id="id"
          v-model="name"
          :aria-describedby="describedBy"
          :invalid="!!(invalid || error)"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
      </UiField>
    </form>
    <template #footer>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton
        variant="primary"
        type="submit"
        :form="formId"
        :disabled="!!invalid"
        :loading="busy"
      >
        Rename
      </UiButton>
    </template>
  </UiModal>
</template>
