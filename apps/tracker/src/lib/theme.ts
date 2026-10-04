import { computed, ref } from 'vue'
import { readStorage, writeStorage } from './storage'

/** What the user chose; `system` follows the OS and is the default. */
export type ThemePreference = 'system' | 'light' | 'dark'
/** What is actually painted. */
export type Theme = 'light' | 'dark'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

let preference: ThemePreference = storedPreference()

/**
 * The public pages (landing, sign-in, sign-up) are always dark: while one is
 * shown the document is painted dark whatever the preference. index.html's
 * inline script does the same before first paint.
 */
let publicPage = document.documentElement.hasAttribute('data-public')

/** The user's theme (not the public pages' forced dark), so charts and toggles follow it. */
export const resolvedTheme = ref<Theme>(resolveTheme(preference))

function storedPreference(): ThemePreference {
  const stored = readStorage('theme')
  return stored === 'dark' || stored === 'light' ? stored : 'system'
}

export function resolveTheme(choice: ThemePreference): Theme {
  if (choice !== 'system') return choice
  return darkQuery().matches ? 'dark' : 'light'
}

/** Browser chrome (status bar, tab strip) per painted ground. */
const THEME_COLOR = { light: '#f8fafc', dark: '#0f172a', public: '#0f131f' } as const

function paint(theme: Theme): void {
  const root = document.documentElement
  const painted = publicPage ? 'dark' : theme
  if (root.dataset.theme !== painted) {
    root.classList.add('theme-transitions')
    root.dataset.theme = painted
  }
  root.toggleAttribute('data-public', publicPage)
  resolvedTheme.value = theme
  const color = THEME_COLOR[publicPage ? 'public' : painted]
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  meta.forEach((m) => (m.content = color))
}

/** Called on every navigation: public routes hold the document dark, others restore the theme. */
export function setPublicPage(on: boolean): void {
  if (on === publicPage) return
  publicPage = on
  paint(resolveTheme(preference))
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
