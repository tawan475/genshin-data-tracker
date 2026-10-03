<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import AppPanel from '@/components/settings/AppPanel.vue'
import AppearancePanel from '@/components/settings/AppearancePanel.vue'
import PasswordPanel from '@/components/settings/PasswordPanel.vue'
import ProfilePanel from '@/components/settings/ProfilePanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

const session = useSession()
const accounts = useAccounts()
const feedback = useFeedback()
const router = useRouter()
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    await session.logout()
  } catch (error) {
    // The store has already forgotten the session; say the server did not hear it.
    feedback.error('Signed out here, but the server could not be reached', error)
  } finally {
    accounts.clear()
    signingOut.value = false
    await router.push({ name: 'login' })
  }
}
</script>

<template>
  <PageHeader title="Settings" />

  <div class="flex max-w-3xl flex-col gap-6">
    <ProfilePanel />
    <AppearancePanel />
    <PasswordPanel />
    <AppPanel />

    <UiPanel title="Session">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <UiButton :loading="signingOut" @click="signOut">
          <LogOut v-if="!signingOut" class="size-5" aria-hidden="true" />
          Sign out
        </UiButton>
      </div>
    </UiPanel>
  </div>
</template>
