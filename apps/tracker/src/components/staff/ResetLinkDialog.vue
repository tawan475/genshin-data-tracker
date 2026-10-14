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
  <UiModal :open="open" :title="$t('staff.resetLink.title')" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <UserLink v-if="user" :user="user" plain />
      <div
        v-for="identity in linked"
        :key="identity.provider"
        class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm"
      >
        <i18n-t keypath="staff.resetLink.isLinked" tag="span" scope="global" class="min-w-0 flex-1">
          <template #provider>{{ providerLabel(identity.provider) }}</template>
          <template #name
            ><span class="font-semibold">{{
              identity.displayName ?? identity.email ?? $t('staff.resetLink.linked')
            }}</span></template
          >
        </i18n-t>
        <UiBadge :title="$t('staff.resetLink.tryFirstTitle')">
          {{ $t('staff.resetLink.tryFirst', { provider: providerLabel(identity.provider) }) }}
        </UiBadge>
      </div>
      <UiError v-if="error" :error="error" :title="$t('staff.resetLink.noLink')" @retry="make" />
      <div v-else-if="!link" class="flex justify-center py-4"><UiSpinner class="size-6" /></div>
      <template v-else>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary">{{
            $t('staff.resetLink.link')
          }}</span>
          <span ref="input" class="flex gap-2">
            <UiInput
              :model-value="link.url"
              readonly
              mono
              class="min-w-0 flex-1 text-[0.8125rem]"
              :aria-label="$t('staff.resetLink.title')"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <UiButton @click="copy">
              <Copy class="size-4" aria-hidden="true" />
              {{ copied ? $t('staff.resetLink.copied') : $t('staff.resetLink.copy') }}
            </UiButton>
          </span>
        </div>
        <span
          class="text-[0.8125rem] text-text-muted"
          :title="$t('staff.resetLink.onceTitle', { date: formatDateTime(link.expiresAt) })"
          >{{ $t('staff.resetLink.once') }}</span
        >
      </template>
    </div>
    <template #footer>
      <UiButton variant="primary" @click="emit('close')">{{ $t('staff.resetLink.done') }}</UiButton>
    </template>
  </UiModal>
</template>
