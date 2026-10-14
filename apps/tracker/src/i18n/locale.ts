import { ref } from 'vue'

/**
 * The site's languages: English, Simplified Chinese, Traditional Chinese
 * (Taiwan wording), in that order of priority. The same codes are used by
 * the game data (`@gdt/game-data` Language), vue-i18n, Intl and <html lang>.
 * Pure (no DOM): the tests import it; choosing and showing one is
 * i18n/apply.ts.
 */
export type Locale = 'en' | 'zh-CN' | 'zh-TW'
export const LOCALES: readonly Locale[] = ['en', 'zh-CN', 'zh-TW']

/** What the user picked; `system` follows the browser. */
export type LocalePreference = 'system' | Locale
export const LOCALE_PREFERENCES: readonly LocalePreference[] = ['system', ...LOCALES]

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/**
 * The browser's languages as one of ours: Traditional Chinese for Taiwan, Hong
 * Kong, Macau and any Hant tag; Simplified for any other Chinese; English
 * otherwise (the first English or Chinese tag decides). Kept in step with the
 * inline script in index.html.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const raw of languages) {
    const tag = raw.toLowerCase()
    if (tag.startsWith('zh')) {
      return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN'
    }
    if (tag.startsWith('en')) return 'en'
  }
  return 'en'
}

/**
 * The language on screen: every name helper and formatter reads it, so a
 * switch re-renders whatever used them.
 */
export const locale = ref<Locale>('en')
