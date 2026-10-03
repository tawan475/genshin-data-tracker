import { readStorage, writeStorage } from './storage'

export type Theme = 'dark' | 'light'

/** The theme applied before first paint by index.html's inline script. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  writeStorage('theme', theme === 'dark' ? null : theme)
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  meta.forEach((m) => (m.content = theme === 'dark' ? '#0e1012' : '#faf9f7'))
}

export function storedTheme(): Theme {
  return readStorage('theme') === 'light' ? 'light' : 'dark'
}
