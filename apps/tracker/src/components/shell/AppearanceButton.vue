<script setup lang="ts">
import { ref } from 'vue'
import { Globe } from 'lucide-vue-next'
import AppearanceControls from '@/components/settings/AppearanceControls.vue'
import UiModal from '@/components/ui/UiModal.vue'

/**
 * The globe in the top bar (and on the public pages): opens Settings →
 * Appearance (theme, language, clock) as a modal, so the language is one tap
 * away from anywhere. `tone="public"` suits the public pages' dark glass.
 */
defineProps<{ tone?: 'app' | 'public' }>()
const open = ref(false)
</script>

<template>
  <button
    type="button"
    class="inline-flex shrink-0 items-center justify-center transition-colors"
    :class="
      tone === 'public'
        ? 'size-10 rounded-full border border-white/10 text-white hover:bg-white/10'
        : 'size-10 rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
    "
    :aria-label="$t('shell.appearance')"
    :title="$t('shell.appearance')"
    aria-haspopup="dialog"
    @click="open = true"
  >
    <Globe class="size-5" aria-hidden="true" />
  </button>
  <UiModal :open="open" :title="$t('settings.appearance.title')" @close="open = false">
    <AppearanceControls />
  </UiModal>
</template>
