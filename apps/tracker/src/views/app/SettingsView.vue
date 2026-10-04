<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import AppPanel from '@/components/settings/AppPanel.vue'
import AppearancePanel from '@/components/settings/AppearancePanel.vue'
import PasswordPanel from '@/components/settings/PasswordPanel.vue'
import ProfilePanel from '@/components/settings/ProfilePanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

const session = useSession()
const accounts = useAccounts()
const feedback = useFeedback()
const router = useRouter()
const signingOut = ref<'here' | 'everywhere' | null>(null)

async function signOut() {
  signingOut.value = 'here'
  try {
    await session.logout()
  } catch (error) {
    // The store has already forgotten the session; say the server did not hear it.
    feedback.error('Signed out here, but the server could not be reached', error)
  } finally {
    accounts.clear()
    signingOut.value = null
    await router.push({ name: 'login' })
  }
}

async function signOutEverywhere() {
  signingOut.value = 'everywhere'
  try {
    await session.logoutAll()
    accounts.clear()
    await router.push({ name: 'login' })
  } catch (error) {
    feedback.error('Could not sign out everywhere', error)
  } finally {
    signingOut.value = null
  }
}
</script>

<template>
  <h1
    class="mb-8 text-3xl font-bold tracking-tight text-slate-900 transition-colors dark:text-white"
  >
    Settings
  </h1>

  <div class="flex max-w-3xl flex-col gap-6">
    <AppearancePanel />
    <ProfilePanel />
    <PasswordPanel />
    <AppPanel />

    <UiPanel title="Session">
      <div class="flex flex-wrap items-center gap-3">
        <UiButton :loading="signingOut === 'here'" :disabled="!!signingOut" @click="signOut">
          <LogOut v-if="signingOut !== 'here'" class="size-5" aria-hidden="true" />
          Sign out
        </UiButton>
        <UiButton
          :loading="signingOut === 'everywhere'"
          :disabled="!!signingOut"
          title="Every device, this one included"
          @click="signOutEverywhere"
        >
          Sign out everywhere
        </UiButton>
      </div>
    </UiPanel>
  </div>
</template>
