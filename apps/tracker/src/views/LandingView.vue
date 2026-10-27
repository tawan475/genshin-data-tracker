<script setup lang="ts">
import { ref } from 'vue'
import LandingCapture from '@/components/landing/LandingCapture.vue'
import LandingFaq from '@/components/landing/LandingFaq.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import LandingHero from '@/components/landing/LandingHero.vue'
import LandingNav from '@/components/landing/LandingNav.vue'
import LandingPrivacy from '@/components/landing/LandingPrivacy.vue'
import LandingSteps from '@/components/landing/LandingSteps.vue'
import LandingTracker from '@/components/landing/LandingTracker.vue'
import AppearanceControls from '@/components/settings/AppearanceControls.vue'
import UiModal from '@/components/ui/UiModal.vue'
import '@/components/landing/landing.css'

/**
 * The landing page: the capture app first, the tracker second (the user's
 * order). Always dark (a public route). Signed in, its links lead to the
 * dashboard instead of sign-in and sign-up.
 */
const languageOpen = ref(false)
</script>

<template>
  <div>
    <div class="lp" data-theme="dark">
      <LandingNav @language="languageOpen = true" />
      <main>
        <LandingHero />
        <LandingSteps />
        <LandingCapture />
        <LandingTracker />
        <LandingPrivacy />
        <LandingFaq />
      </main>
      <LandingFooter />
    </div>
    <UiModal
      :open="languageOpen"
      :title="$t('settings.appearance.language')"
      @close="languageOpen = false"
    >
      <AppearanceControls language-only />
    </UiModal>
  </div>
</template>
