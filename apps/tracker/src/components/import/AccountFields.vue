<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import {
  SERVER_OPTIONS,
  serverFromUid,
  type AccountFormErrors,
  type AccountFormValues,
} from '@/data/import-setup'

/**
 * Name, UID and server of a Genshin account, for "Add account" and account
 * settings. Typing a UID picks its server unless the user chose one.
 */
defineProps<{ errors: AccountFormErrors; disabled?: boolean }>()
const form = defineModel<AccountFormValues>({ required: true })

const serverChosen = ref(false)
const detected = computed(() => serverFromUid(form.value.uid.replace(/\s+/g, '')))

watch(detected, (server) => {
  if (server && !serverChosen.value) form.value.server = server
})

const server = computed({
  get: () => form.value.server,
  set: (value) => {
    serverChosen.value = true
    form.value.server = value
  },
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiField v-slot="{ id, describedBy, invalid }" label="Name" optional :error="errors.name">
      <UiInput
        :id="id"
        v-model="form.name"
        :aria-describedby="describedBy"
        :invalid="invalid"
        :disabled="disabled"
        placeholder="Main"
        maxlength="64"
        autocomplete="off"
      />
    </UiField>
    <div class="grid gap-4 sm:grid-cols-2">
      <UiField v-slot="{ id, describedBy, invalid }" label="UID" optional :error="errors.uid">
        <UiInput
          :id="id"
          v-model="form.uid"
          mono
          inputmode="numeric"
          autocomplete="off"
          maxlength="12"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :disabled="disabled"
        />
      </UiField>
      <UiField v-slot="{ id, describedBy, invalid }" label="Server" optional :error="errors.server">
        <UiSelect
          :id="id"
          v-model="server"
          :options="SERVER_OPTIONS"
          :aria-describedby="describedBy"
          :invalid="invalid"
          :disabled="disabled"
        />
      </UiField>
    </div>
  </div>
</template>
