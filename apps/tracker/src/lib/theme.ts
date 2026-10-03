import { readStorage, writeStorage } from './storage'

export type Theme = 'dark' | 'light'

/** The theme applied before first paint by index.html's inline script. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (root.dataset.theme !== theme) {
    root.classList.add('theme-transitions')
    root.dataset.theme = theme
  }
  writeStorage('theme', theme === 'light' ? null : theme)
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  meta.forEach((m) => (m.content = theme === 'dark' ? '#0f172a' : '#f8fafc'))
}

export function storedTheme(): Theme {
  return readStorage('theme') === 'dark' ? 'dark' : 'light'
}
