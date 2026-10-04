import { computed, ref } from 'vue'
import { readStorage, writeStorage } from './storage'

/** What the user chose; `system` follows the OS and is the default. */
export type ThemePreference = 'system' | 'light' | 'dark'
/** What is actually painted. */
export type Theme = 'light' | 'dark'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

let preference: ThemePreference = storedPreference()

/** The painted theme, reactive so charts and toggles follow it. */
export const resolvedTheme = ref<Theme>(currentTheme())

/** The theme applied before first paint by index.html's inline script. */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function storedPreference(): ThemePreference {
  const stored = readStorage('theme')
  return stored === 'dark' || stored === 'light' ? stored : 'system'
}

export function resolveTheme(choice: ThemePreference): Theme {
  if (choice !== 'system') return choice
  return darkQuery().matches ? 'dark' : 'light'
}

function paint(theme: Theme): void {
  const root = document.documentElement
  if (root.dataset.theme !== theme) {
    root.classList.add('theme-transitions')
    root.dataset.theme = theme
  }
  resolvedTheme.value = theme
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  meta.forEach((m) => (m.content = theme === 'dark' ? '#0f172a' : '#f8fafc'))
}

export function applyTheme(choice: ThemePreference): void {
  preference = choice
  writeStorage('theme', choice === 'system' ? null : choice)
  paint(resolveTheme(choice))
}

// While following the OS, repaint when it switches.
try {
  darkQuery().addEventListener('change', () => {
    if (preference === 'system') paint(resolveTheme('system'))
  })
} catch {
  // Very old browsers: the theme just won't follow live OS changes.
}

/** For chart colours, which the original picked per theme. */
export const isDark = computed(() => resolvedTheme.value === 'dark')
