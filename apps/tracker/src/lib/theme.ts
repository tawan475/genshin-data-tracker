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

/**
 * Paints `theme`. A switch the user sees (`animate`: their toggle, or the OS
 * flipping while they follow it) crossfades a snapshot of the whole page
 * (View Transitions): the new theme lands in one step, so no element is ever
 * caught half-way, and the cost doesn't grow with the page (a per-element
 * colour fade left big pages, e.g. a large artifact list, light-on-light for
 * a while). Without View Transitions, or with reduced motion, it switches at
 * once.
 */
function paint(theme: Theme, animate = false): void {
  const root = document.documentElement
  const painted = publicPage ? 'dark' : theme
  const apply = () => {
    // No element fades its own colours across the switch (hover transitions
    // would start from the old theme): transitions are off for this one frame.
    root.classList.add('theme-switching')
    root.dataset.theme = painted
    root.toggleAttribute('data-public', publicPage)
    void getComputedStyle(root).color
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching')),
    )
  }
  if (root.dataset.theme === painted) apply()
  else if (animate && 'startViewTransition' in document && !reducedMotion()) {
    document.startViewTransition(apply)
  } else apply()
  resolvedTheme.value = theme
  const color = THEME_COLOR[publicPage ? 'public' : painted]
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  meta.forEach((m) => (m.content = color))
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
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
  paint(resolveTheme(choice), true)
}

// While following the OS, repaint when it switches.
try {
  darkQuery().addEventListener('change', () => {
    if (preference === 'system') paint(resolveTheme('system'), true)
  })
} catch {
  // Very old browsers: the theme just won't follow live OS changes.
}

/** For chart colours, which the original picked per theme. */
export const isDark = computed(() => resolvedTheme.value === 'dark')
