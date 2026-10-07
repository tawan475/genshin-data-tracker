<script setup lang="ts">
import type { OAuthProvider } from '@gdt/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { api } from '@/api'
import ProviderMark from './ProviderMark.vue'
import { loadProviders, providerLabel } from './oauth'

/**
 * "Continue with Discord / Google" on the sign-in and sign-up cards: only the
 * providers the server has, so nothing shows until their secrets are set.
 */
const props = defineProps<{ next?: string }>()

const providers = ref<OAuthProvider[]>([])
const busy = ref<OAuthProvider | null>(null)
const error = ref('')

/** Back from the provider with the browser's Back button: the page may be restored as it was left. */
function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) busy.value = null
}

onMounted(async () => {
  window.addEventListener('pageshow', onPageShow)
  providers.value = await loadProviders()
})
onBeforeUnmount(() => window.removeEventListener('pageshow', onPageShow))

async function go(provider: OAuthProvider) {
  error.value = ''
  busy.value = provider
  try {
    const { url } = await api.oauthStart(provider, props.next)
    window.location.assign(url)
  } catch (cause) {
    busy.value = null
    error.value = cause instanceof Error ? cause.message : 'Could not start'
  }
}
</script>

<template>
  <div v-if="providers.length" class="mt-6 flex flex-col gap-3">
    <div class="flex items-center gap-3 text-xs tracking-wider text-gray-500 uppercase">
      <span class="h-px flex-1 bg-white/10" />
      or
      <span class="h-px flex-1 bg-white/10" />
    </div>
    <button
      v-for="provider in providers"
      :key="provider"
      type="button"
      class="btn-glass w-full rounded-xl px-4 text-sm sm:text-base"
      :disabled="busy !== null"
      @click="go(provider)"
    >
      <UiSpinner v-if="busy === provider" class="size-5 shrink-0" />
      <ProviderMark v-else :provider="provider" class="size-5 shrink-0" />
      <span>Continue with {{ providerLabel(provider) }}</span>
    </button>
    <p v-if="error" class="text-sm text-red-300" role="alert">{{ error }}</p>
  </div>
</template>
