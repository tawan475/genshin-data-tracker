<script setup lang="ts">
import type { UserSettings } from '@gdt/shared'
import { TAB_BAR_MAX, USER_SETTINGS_DEFAULTS } from '@gdt/shared/settings'
import { computed, ref } from 'vue'
import { ACCOUNT_SECTIONS } from '@/components/shell/nav'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { t } from '@/i18n'
import { applyLocale, storedPreference } from '@/i18n/apply'
import { LANGUAGE_NAMES } from '@/i18n/language-names'
import { LOCALES, type LocalePreference } from '@/i18n/locale'
import { setClockPreference } from '@/lib/format'
import { applyTheme, type ThemePreference } from '@/lib/theme'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Theme, language and clock, as the Settings card and the top bar's modal
 * show them. `updateSettings` applies the change before the server answers;
 * if the save fails, the previous value is put back here (the store keeps the
 * optimistic value) and a toast says so. The language also applies and is
 * remembered on this device at once (i18n/apply.ts); the account's setting
 * follows it to the user's other devices. Signed out (the public pages, which
 * are always dark) only the language shows, kept on this device.
 */
/**
 * `inline`: side by side on Settings (the top bar's modal stacks them).
 * `languageOnly`: the public pages (always dark): theme and clock would
 * change nothing there (a theme pick only flashed the page), so only the
 * language shows, signed in or not.
 */
const props = defineProps<{ inline?: boolean; languageOnly?: boolean }>()
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
  ...LOCALES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] })),
])

const theme = computed<ThemePreference>({
  get: () => session.settings.theme,
  set: (value) => void save({ theme: value }, t('settings.appearance.themeNotSaved')),
})
const use24Hour = computed<boolean>({
  get: () => session.settings.use24Hour,
  set: (value) => void save({ use24Hour: value }, t('settings.appearance.clockNotSaved')),
})
/** The phone tab bar's pages: toggled here, kept in the sidebar's order, at most TAB_BAR_MAX. */
const tabBar = computed(() => new Set(session.settings.tabBar ?? USER_SETTINGS_DEFAULTS.tabBar))
function toggleTab(label: string) {
  const picked = new Set(tabBar.value)
  if (picked.has(label)) picked.delete(label)
  else if (picked.size < TAB_BAR_MAX) picked.add(label)
  else return
  const order = ACCOUNT_SECTIONS.map((s) => s.label as string)
  void save({ tabBar: order.filter((l) => picked.has(l)) }, t('settings.appearance.tabBarNotSaved'))
}
const signedIn = computed(() => session.status === 'signed-in')
/** Theme and clock: the app's pages, signed in. */
const full = computed(() => signedIn.value && !props.languageOnly)
/** Signed out: the pick made on this device. */
const localLanguage = ref<LocalePreference>(storedPreference())
const language = computed<LocalePreference>({
  get: () => (signedIn.value ? (session.settings.language ?? 'system') : localLanguage.value),
  set: (value) => {
    void applyLocale(value, { persist: true, animate: true })
    if (signedIn.value) void save({ language: value }, t('settings.appearance.languageNotSaved'))
    else localLanguage.value = value
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
  if (patch.tabBar !== undefined && me.settings.tabBar === patch.tabBar) {
    restored.tabBar = before.tabBar
    changed = true
  }
  if (changed) session.me = { ...me, settings: restored }
}
</script>

<template>
  <div
    :class="
      props.inline
        ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] items-end gap-x-8 gap-y-4 [&>*]:py-0! [&>.flex]:flex-col [&>.flex]:items-start'
        : 'flex flex-col divide-y divide-border-subtle'
    "
  >
    <div v-if="full" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
      <span class="text-base">{{ $t('settings.appearance.theme') }}</span>
      <UiSegmented v-model="theme" :options="themes" :label="$t('settings.appearance.theme')" />
    </div>
    <div
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
      :class="full ? 'py-3' : 'pb-1'"
    >
      <span class="text-base">{{ $t('settings.appearance.language') }}</span>
      <UiSelect
        v-model="language"
        :options="languages"
        :aria-label="$t('settings.appearance.language')"
        class="w-44"
      />
    </div>
    <div v-if="full" class="py-3">
      <UiSwitch v-model="use24Hour" :label="$t('settings.appearance.clock24')" />
    </div>
    <div v-if="full" class="flex flex-col gap-2 pt-3">
      <span class="text-base" :title="$t('settings.appearance.tabBarHint', { n: TAB_BAR_MAX })"
        >{{ $t('settings.appearance.tabBar') }}
        <span class="text-sm text-text-muted tabular-nums"
          >{{ tabBar.size }}/{{ TAB_BAR_MAX }}</span
        ></span
      >
      <div class="flex flex-wrap gap-2" role="group" :aria-label="$t('settings.appearance.tabBar')">
        <FilterChip
          v-for="section in ACCOUNT_SECTIONS"
          :key="section.name"
          :pressed="tabBar.has(section.label)"
          :disabled="!tabBar.has(section.label) && tabBar.size >= TAB_BAR_MAX"
          @toggle="toggleTab(section.label)"
        >
          <component :is="section.icon" class="size-4" aria-hidden="true" />
          {{ $t(`shell.nav.${section.label}`) }}
        </FilterChip>
      </div>
    </div>
  </div>
</template>
