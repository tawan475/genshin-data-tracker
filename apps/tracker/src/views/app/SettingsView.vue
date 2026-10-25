<script setup lang="ts">
import { ChevronRight, MonitorSmartphone } from 'lucide-vue-next'
import AppPanel from '@/components/settings/AppPanel.vue'
import AppearancePanel from '@/components/settings/AppearancePanel.vue'
import ConnectedAccountsPanel from '@/components/settings/ConnectedAccountsPanel.vue'
import DeleteUserPanel from '@/components/settings/DeleteUserPanel.vue'
import PasswordPanel from '@/components/settings/PasswordPanel.vue'
import ProfilePanel from '@/components/settings/ProfilePanel.vue'
import UserImportKeyPanel from '@/components/settings/UserImportKeyPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
</script>

<template>
  <PageHeader :title="$t('shell.page.settings')" />

  <!-- Tiles: cards flow into columns so short ones don't leave the width empty. -->
  <div class="columns-1 gap-6 md:columns-2 2xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
    <ProfilePanel />
    <UserImportKeyPanel />
    <AppearancePanel />
    <PasswordPanel />
    <ConnectedAccountsPanel />
    <AppPanel />
    <UiPanel :title="$t('settings.devices.title')" flush>
      <template #actions>
        <UiButton size="sm" :to="{ name: 'settings-devices' }">
          <MonitorSmartphone class="size-4" aria-hidden="true" />
          {{ $t('shell.page.devices') }}
          <ChevronRight class="size-4" aria-hidden="true" />
        </UiButton>
      </template>
    </UiPanel>
    <DeleteUserPanel />
  </div>
</template>
