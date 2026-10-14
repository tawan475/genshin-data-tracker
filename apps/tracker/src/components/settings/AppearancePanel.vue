<script setup lang="ts">
import type { UserSettings } from '@gdt/shared'
import { computed } from 'vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { t } from '@/i18n'
import { applyLocale, previewEnabled } from '@/i18n/apply'
import type { LocalePreference } from '@/i18n/locale'
import { setClockPreference } from '@/lib/format'
import { applyTheme, type ThemePreference } from '@/lib/theme'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Theme, clock and language. `updateSettings` applies the change before the
 * server answers; if the save fails, the previous value is put back here (the
 * store keeps the optimistic value) and a toast says so. The language also
 * applies and is remembered on this device at once (i18n/apply.ts); the
 * account's setting follows it to the user's other devices. Until the
 * switcher launches it shows only with the preview flag (`previewEnabled`).
 */
const session = useSession()
const feedback = useFeedback()

const themes = computed<{ value: ThemePreference; label: string }[]>(() => [
  { value: 'system', label: t('settings.appearance.system') },
  { value: 'light', label: t('settings.appearance.light') },
  { value: 'dark', label: t('settings.appearance.dark') },
])

/** Each language named in itself, whatever the language on screen. */
const languages = computed<{ value: LocalePreference; label: string }[]>(() => [
  { value: 'system', label: t('settings.appearance.system') },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
])
const showLanguage = previewEnabled()

const theme = computed<ThemePreference>({
  get: () => session.settings.theme,
  set: (value) => void save({ theme: value }, t('settings.appearance.themeNotSaved')),
})
const use24Hour = computed<boolean>({
  get: () => session.settings.use24Hour,
  set: (value) => void save({ use24Hour: value }, t('settings.appearance.clockNotSaved')),
})
const language = computed<LocalePreference>({
  get: () => session.settings.language ?? 'system',
  set: (value) => {
    void applyLocale(value, { persist: true, animate: true })
    void save({ language: value }, t('settings.appearance.languageNotSaved'))
  },
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
  if (patch.language !== undefined && me.settings.language === patch.language) {
    restored.language = before.language
    changed = true
  }
  if (changed) session.me = { ...me, settings: restored }
}
</script>

<template>
  <UiPanel :title="$t('settings.appearance.title')">
    <div class="flex flex-col divide-y divide-border-subtle">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <span class="text-base">{{ $t('settings.appearance.theme') }}</span>
        <UiSegmented v-model="theme" :options="themes" :label="$t('settings.appearance.theme')" />
      </div>
      <div
        v-if="showLanguage"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
      >
        <span class="text-base">{{ $t('settings.appearance.language') }}</span>
        <UiSegmented
          v-model="language"
          :options="languages"
          :label="$t('settings.appearance.language')"
        />
      </div>
      <div class="pt-1">
        <UiSwitch v-model="use24Hour" :label="$t('settings.appearance.clock24')" />
      </div>
    </div>
  </UiPanel>
</template>
