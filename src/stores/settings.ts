import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const use24Hour = ref(localStorage.getItem('use24Hour') === 'true')
  const theme = ref(localStorage.getItem('theme') || 'light')

  function toggle24Hour() {
    use24Hour.value = !use24Hour.value
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  watch(use24Hour, (val) => {
    localStorage.setItem('use24Hour', String(val))
  })

  watch(theme, (val) => {
    localStorage.setItem('theme', val)
    if (val === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, { immediate: true })

  return { use24Hour, toggle24Hour, theme, toggleTheme }
})
