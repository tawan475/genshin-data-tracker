const TOKEN_KEY = 'accessToken'
const THEME_KEY = 'gdt:user:theme'
const LEGACY_THEME_KEY = 'theme'

export type StoredTheme = 'light' | 'dark'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function isLoggedInStorage(): boolean {
  return !!safeGet(TOKEN_KEY)
}

export function readStoredTheme(): StoredTheme {
  const theme = safeGet(THEME_KEY) ?? safeGet(LEGACY_THEME_KEY)
  return theme === 'dark' ? 'dark' : 'light'
}

export function applyDocumentTheme(theme: StoredTheme): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
  }
}

export function bootstrapTheme(): void {
  if (!isLoggedInStorage()) {
    applyDocumentTheme('light')
    return
  }
  applyDocumentTheme(readStoredTheme())
}

export function enableThemeTransitions(): void {
  requestAnimationFrame(() => {
    document.documentElement.classList.add('theme-transitions')
  })
}

bootstrapTheme()
enableThemeTransitions()
