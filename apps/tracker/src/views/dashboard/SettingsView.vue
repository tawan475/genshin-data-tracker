<script setup lang="ts">
import { useSettingsStore } from '../../stores/settings'

const settingsStore = useSettingsStore()
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-8 transition-colors">Settings</h1>
    <div class="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-lg transition-colors border border-transparent dark:border-slate-700">
      <div class="px-4 py-5 sm:p-6">
        <h3 class="text-lg leading-6 font-medium text-slate-900 dark:text-white transition-colors">Preferences</h3>
        <div class="mt-4 max-w-xl text-sm text-slate-500 dark:text-slate-400 transition-colors">
          <p>Customize your experience.</p>
        </div>
        <div class="mt-5 space-y-6">
          <div class="flex items-center justify-between">
            <span class="flex-grow flex flex-col">
              <span class="text-sm font-medium text-slate-900 dark:text-slate-200 transition-colors" id="availability-label">Use 24-hour time</span>
              <span class="text-sm text-slate-500 dark:text-slate-400 transition-colors" id="availability-description">Display time in 24-hour format across the dashboard.</span>
            </span>
            <button type="button" :class="[settingsStore.use24Hour ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800']" role="switch" :aria-checked="settingsStore.use24Hour" @click="settingsStore.toggle24Hour">
              <span aria-hidden="true" :class="[settingsStore.use24Hour ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200']"></span>
            </button>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex-grow flex flex-col">
              <span class="text-sm font-medium text-slate-900 dark:text-slate-200 transition-colors" id="theme-label">Dark Mode</span>
              <span class="text-sm text-slate-500 dark:text-slate-400 transition-colors" id="theme-description">Enable dark theme across the dashboard.</span>
            </span>
            <button type="button" :class="[settingsStore.theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600', 'relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800']" role="switch" :aria-checked="settingsStore.theme === 'dark'" @click="settingsStore.toggleTheme">
              <span aria-hidden="true" :class="[settingsStore.theme === 'dark' ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200']"></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
