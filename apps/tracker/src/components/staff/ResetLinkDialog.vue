<script setup lang="ts">
import type { IdentityResponse, StaffResetLinkResponse } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Copy } from 'lucide-vue-next'
import { providerLabel } from '@/components/oauth/oauth'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { api } from '@/api'
import { copyText } from '@/data/import-setup'
import { formatDateTime } from '@/lib/format'
import UserLink from './UserLink.vue'

/**
 * Makes a 24-hour password reset link when it opens and shows it once, with
 * Copy. A linked Discord / Google is named first: whoever is asking may be
 * able to sign in with it, or prove they own it.
 */
const props = defineProps<{
  open: boolean
  user: { id: number; username: string } | null
  identities?: IdentityResponse[]
}>()
const emit = defineEmits<{ close: [] }>()

const link = ref<StaffResetLinkResponse | null>(null)
const error = ref<unknown>(null)
const copied = ref(false)
const input = ref<HTMLElement | null>(null)

async function make() {
  if (!props.user) return
  link.value = null
  error.value = null
  copied.value = false
  try {
    link.value = await api.staff.resetLink(props.user.id)
  } catch (cause) {
    error.value = cause
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void make()
    else link.value = null
  },
)

const linked = computed(() => props.identities ?? [])

async function copy() {
  if (!link.value) return
  copied.value = await copyText(link.value.url, input.value)
}
</script>

<template>
  <UiModal :open="open" title="Reset link" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <UserLink v-if="user" :user="user" plain />
      <div
        v-for="identity in linked"
        :key="identity.provider"
        class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm"
      >
        <span class="min-w-0 flex-1">
          {{ providerLabel(identity.provider) }}
          <span class="font-semibold">{{
            identity.displayName ?? identity.email ?? 'linked'
          }}</span>
          is linked
        </span>
        <UiBadge title="If the person asking can sign in with it, they don't need a reset link">
          Try {{ providerLabel(identity.provider) }} first
        </UiBadge>
      </div>
      <UiError v-if="error" :error="error" title="No link made" @retry="make" />
      <div v-else-if="!link" class="flex justify-center py-4"><UiSpinner class="size-6" /></div>
      <template v-else>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary">Link</span>
          <span ref="input" class="flex gap-2">
            <UiInput
              :model-value="link.url"
              readonly
              mono
              class="min-w-0 flex-1 text-[0.8125rem]"
              aria-label="Reset link"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <UiButton @click="copy">
              <Copy class="size-4" aria-hidden="true" />
              {{ copied ? 'Copied' : 'Copy' }}
            </UiButton>
          </span>
        </div>
        <span
          class="text-[0.8125rem] text-text-muted"
          :title="`Sets a new password once, then stops working. Expires ${formatDateTime(link.expiresAt)}; can't be shown again.`"
          >One use · 24 h · shown once</span
        >
      </template>
    </div>
    <template #footer>
      <UiButton variant="primary" @click="emit('close')">Done</UiButton>
    </template>
  </UiModal>
</template>
