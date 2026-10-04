<script setup lang="ts">
import type { UserSettings } from '@gdt/shared'
import { computed } from 'vue'
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
  <div
    class="overflow-hidden border border-transparent bg-white shadow transition-colors sm:rounded-lg dark:border-slate-700 dark:bg-slate-800"
  >
    <div class="px-4 py-5 sm:p-6">
      <h3 class="text-lg leading-6 font-medium text-slate-900 transition-colors dark:text-white">
        Preferences
      </h3>
      <div class="mt-4 max-w-xl text-sm text-slate-500 transition-colors dark:text-slate-400">
        <p>Customize your experience.</p>
      </div>
      <div class="mt-5 space-y-6">
        <div class="flex items-center justify-between gap-4">
          <span class="flex flex-grow flex-col">
            <span
              id="clock-label"
              class="text-sm font-medium text-slate-900 transition-colors dark:text-slate-200"
              >Use 24-hour time</span
            >
            <span
              id="clock-description"
              class="text-sm text-slate-500 transition-colors dark:text-slate-400"
              >Display time in 24-hour format across the dashboard.</span
            >
          </span>
          <button
            type="button"
            :class="[
              use24Hour ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600',
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-slate-800',
            ]"
            role="switch"
            :aria-checked="use24Hour"
            aria-labelledby="clock-label"
            aria-describedby="clock-description"
            @click="use24Hour = !use24Hour"
          >
            <span
              aria-hidden="true"
              :class="[
                use24Hour ? 'translate-x-5' : 'translate-x-0',
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              ]"
            ></span>
          </button>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <span class="flex flex-grow flex-col">
            <span
              id="theme-label"
              class="text-sm font-medium text-slate-900 transition-colors dark:text-slate-200"
              >Theme</span
            >
            <span
              id="theme-description"
              class="text-sm text-slate-500 transition-colors dark:text-slate-400"
              >Follow your device, or always use light or dark.</span
            >
          </span>
          <div
            class="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
            role="radiogroup"
            aria-labelledby="theme-label"
          >
            <button
              v-for="option in themes"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="theme === option.value"
              class="px-3 py-1.5 text-sm font-medium transition-colors"
              :class="
                theme === option.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/50'
              "
              @click="theme = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
