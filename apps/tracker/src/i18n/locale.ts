import { SITE_LANGUAGES, type SiteLanguage } from '@gdt/shared/settings'
import { ref } from 'vue'

/**
 * The site's languages: every language the game ships (English, Simplified
 * and Traditional Chinese, Japanese, Korean, Spanish, French, Russian, Thai,
 * Vietnamese, German, Indonesian, Portuguese, Italian, Turkish). The same
 * codes are used by the game data (`@gdt/game-data` Language), vue-i18n, Intl
 * and <html lang>. Pure (no DOM): the tests import it; choosing and showing
 * one is i18n/apply.ts.
 */
export type Locale = SiteLanguage
export const LOCALES: readonly Locale[] = SITE_LANGUAGES

/** What the user picked; `system` follows the browser. */
export type LocalePreference = 'system' | Locale
export const LOCALE_PREFERENCES: readonly LocalePreference[] = ['system', ...LOCALES]

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/**
 * The browser's languages as one of ours: the first tag whose language we
 * have decides (Chinese: Traditional for Taiwan, Hong Kong, Macau and any
 * Hant tag, else Simplified; `in` is Indonesian's old code); English when
 * none is ours. Kept in step with the inline script in index.html.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const raw of languages) {
    const tag = raw.toLowerCase()
    if (tag.startsWith('zh')) {
      return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN'
    }
    const base = tag.split(/[-_]/)[0]
    const code = base === 'in' ? 'id' : base
    if (isLocale(code)) return code
  }
  return 'en'
}

/**
 * The language on screen: every name helper and formatter reads it, so a
 * switch re-renders whatever used them.
 */
export const locale = ref<Locale>('en')
