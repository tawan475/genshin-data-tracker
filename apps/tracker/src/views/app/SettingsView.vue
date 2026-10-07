<script setup lang="ts">
import AppPanel from '@/components/settings/AppPanel.vue'
import AppearancePanel from '@/components/settings/AppearancePanel.vue'
import ConnectedAccountsPanel from '@/components/settings/ConnectedAccountsPanel.vue'
import PasswordPanel from '@/components/settings/PasswordPanel.vue'
import ProfilePanel from '@/components/settings/ProfilePanel.vue'
import SessionsPanel from '@/components/settings/SessionsPanel.vue'
import UserImportKeyPanel from '@/components/settings/UserImportKeyPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
</script>

<template>
  <PageHeader title="Settings" />

  <!-- Tiles: cards flow into columns so short ones don't leave the width empty. -->
  <div class="columns-1 gap-6 md:columns-2 2xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
    <ProfilePanel />
    <UserImportKeyPanel />
    <AppearancePanel />
    <PasswordPanel />
    <ConnectedAccountsPanel />
    <AppPanel />
    <SessionsPanel />
  </div>
</template>
