<script setup lang="ts">
import AppPanel from '@/components/settings/AppPanel.vue'
import AppearancePanel from '@/components/settings/AppearancePanel.vue'
import ConnectedAccountsPanel from '@/components/settings/ConnectedAccountsPanel.vue'
import DeleteUserPanel from '@/components/settings/DeleteUserPanel.vue'
import DevicesSummary from '@/components/settings/DevicesSummary.vue'
import PasswordPanel from '@/components/settings/PasswordPanel.vue'
import ProfilePanel from '@/components/settings/ProfilePanel.vue'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import UserImportKeyPanel from '@/components/settings/UserImportKeyPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
</script>

<template>
  <PageHeader :title="$t('shell.page.settings')" />

  <!-- In order: the user, then how the site looks, then the app itself. Rows
       wrap by width (flex-basis), never by column count or content size. -->
  <div class="flex flex-col gap-8">
    <SettingsSection :label="$t('shell.section.account')">
      <ProfilePanel />
      <div class="flex flex-wrap items-stretch gap-4 [&>*]:min-w-0 [&>*]:flex-[1_1_24rem]">
        <PasswordPanel />
        <ConnectedAccountsPanel />
      </div>
      <DevicesSummary />
      <UserImportKeyPanel />
    </SettingsSection>
    <SettingsSection :label="$t('settings.appearance.title')">
      <AppearancePanel />
    </SettingsSection>
    <SettingsSection :label="$t('settings.app.title')">
      <AppPanel />
    </SettingsSection>
    <DeleteUserPanel />
  </div>
</template>
