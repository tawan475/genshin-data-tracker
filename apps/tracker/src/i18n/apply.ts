import { readStorage, writeStorage } from '@/lib/storage'
import { i18n, setLocale } from './index'
import { detectLocale, isLocale, type Locale, type LocalePreference } from './locale'

/**
 * Choosing and showing the language in the browser (the DOM side of
 * i18n/index.ts): the device's saved pick, the browser's languages, the
 * preview gate, <html lang>.
 */

/**
 * Until the switcher launches, other languages show only with the preview
 * flag (`gdt:i18n-preview` = 1) or in development; everyone else stays on
 * English whatever their browser says.
 */
export function previewEnabled(): boolean {
  return import.meta.env.DEV || readStorage('i18n-preview') === '1'
}

/** The preference saved on this device (`gdt:lang`), `system` when none. */
export function storedPreference(): LocalePreference {
  const stored = readStorage('lang')
  return isLocale(stored) ? stored : 'system'
}

/** The language a preference shows. */
export function resolveLocale(preference: LocalePreference): Locale {
  if (!previewEnabled()) return 'en'
  return preference === 'system' ? detectLocale(navigator.languages ?? []) : preference
}

/**
 * Shows a preference's language (i18n/index.ts setLocale), crossfading where
 * View Transitions exist when `animate`, and sets <html lang> (the font stack
 * follows it). `persist` saves the choice on this device (`gdt:lang`;
 * removed for `system`).
 */
export async function applyLocale(
  preference: LocalePreference,
  { persist = false, animate = false } = {},
): Promise<void> {
  if (persist) writeStorage('lang', preference === 'system' ? null : preference)
  const target = resolveLocale(preference)
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  await setLocale(target, (show) => {
    const paint = () => {
      show()
      document.documentElement.lang = target
    }
    if (animate && !reduced && 'startViewTransition' in document) {
      document.startViewTransition(paint)
    } else {
      paint()
    }
  })
  document.documentElement.lang = target
}

/** Development only: a key with no English message warns in the console. */
export function warnMissingKeys(): void {
  i18n.global.missingWarn = import.meta.env.DEV
}
