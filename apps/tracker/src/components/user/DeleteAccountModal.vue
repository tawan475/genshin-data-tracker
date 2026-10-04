<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, nextTick, ref, watch } from 'vue'
import BaseButton from '@/components/legacy/BaseButton.vue'
import BaseModal from '@/components/legacy/BaseModal.vue'
import { discardImportQueue } from '@/data/import-queue'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'

/**
 * The original "Delete Account?" dialog: type the account's nickname to
 * confirm. Accounts without a nickname use the name the app shows for them.
 */
const props = defineProps<{ account: AccountResponse | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const accounts = useAccounts()
const feedback = useFeedback()

const typed = ref('')
const validation = ref('')
const deleting = ref(false)
const input = ref<HTMLInputElement | null>(null)

const confirmWord = computed(() =>
  props.account ? props.account.name || accounts.displayName(props.account) : '',
)

watch(
  () => props.account?.id,
  async (id) => {
    typed.value = ''
    validation.value = ''
    if (id !== undefined) {
      await nextTick()
      input.value?.focus()
    }
  },
)

const open = computed({
  get: () => props.account !== null,
  set: (value) => {
    if (!value && !deleting.value) emit('close')
  },
})

async function confirmDelete() {
  const account = props.account
  if (!account) return
  if (typed.value !== confirmWord.value) {
    validation.value = 'Account nickname does not match'
    return
  }
  validation.value = ''
  deleting.value = true
  try {
    await accounts.remove(account.id)
    discardImportQueue(account.id)
    deleting.value = false
    emit('close')
    feedback.toast({ tone: 'success', title: 'Account deleted' })
  } catch (error) {
    validation.value = error instanceof Error ? error.message : 'Failed to delete account'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <BaseModal v-model="open" title="Delete Account?">
    <form class="p-6 space-y-4" @submit.prevent="confirmDelete">
      <p class="text-sm text-slate-600 dark:text-slate-300">
        This action cannot be undone. To verify, type
        <strong class="break-all text-slate-900 dark:text-white">{{ confirmWord }}</strong> below:
      </p>
      <input
        ref="input"
        v-model="typed"
        type="text"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        :placeholder="confirmWord"
        :disabled="deleting"
        aria-label="Account nickname"
        class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
        @input="validation = ''"
      />
      <div
        v-if="validation"
        role="alert"
        class="px-3 py-2 rounded-md text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400"
      >
        {{ validation }}
      </div>
      <div class="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 mt-6">
        <BaseButton variant="outline" type="button" :disabled="deleting" @click="emit('close')">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" type="submit" :loading="deleting">
          Permanently Delete
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>
