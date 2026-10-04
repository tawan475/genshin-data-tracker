<script setup lang="ts">
import type { UserSettings } from '@gdt/shared'
import { computed } from 'vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { setClockPreference } from '@/lib/format'
import { applyTheme, type ThemePreference } from '@/lib/theme'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Theme and clock. `updateSettings` applies the change before the server
 * answers; if the save fails, the previous value is put back here (the store
 * keeps the optimistic value) and a toast says so.
 */
const session = useSession()
const feedback = useFeedback()

const themes: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const theme = computed<ThemePreference>({
  get: () => session.settings.theme,
  set: (value) => void save({ theme: value }, 'Could not save the theme'),
})
const use24Hour = computed<boolean>({
  get: () => session.settings.use24Hour,
  set: (value) => void save({ use24Hour: value }, 'Could not save the clock setting'),
})

async function save(patch: Partial<UserSettings>, failure: string) {
  const before = { ...session.settings }
  try {
    await session.updateSettings(patch)
  } catch (error) {
    rollback(patch, before)
    feedback.error(failure, error)
  }
}

/** Restores each patched key, unless a later change has already replaced it. */
function rollback(patch: Partial<UserSettings>, before: UserSettings) {
  const me = session.me
  if (!me) return
  const restored = { ...me.settings }
  let changed = false
  if (patch.theme !== undefined && me.settings.theme === patch.theme) {
    restored.theme = before.theme
    applyTheme(before.theme)
    changed = true
  }
  if (patch.use24Hour !== undefined && me.settings.use24Hour === patch.use24Hour) {
    restored.use24Hour = before.use24Hour
    setClockPreference(before.use24Hour)
    changed = true
  }
  if (changed) session.me = { ...me, settings: restored }
}
</script>

<template>
  <UiPanel title="Appearance">
    <div class="flex flex-col divide-y divide-border-subtle">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <span class="text-base">Theme</span>
        <UiSegmented v-model="theme" :options="themes" label="Theme" />
      </div>
      <div class="pt-1">
        <UiSwitch v-model="use24Hour" label="24-hour clock" />
      </div>
    </div>
  </UiPanel>
</template>
