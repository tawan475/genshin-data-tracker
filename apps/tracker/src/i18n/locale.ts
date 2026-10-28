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
 * have decides; English when none is ours. Chinese (and Cantonese, `yue`):
 * the script says which (Hant/Hans), else the region (Taiwan, Hong Kong,
 * Macau read Traditional), else Simplified for `zh` and Traditional for
 * `yue`. `in` is Indonesian's old code. Kept in step with the inline script
 * in index.html (`first-paint.test.ts` runs it over the same tags).
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const raw of languages) {
    const parts = String(raw).toLowerCase().split(/[-_]/)
    const base = parts[0]
    if (base === 'zh' || base === 'yue') {
      if (parts.includes('hant')) return 'zh-TW'
      if (parts.includes('hans')) return 'zh-CN'
      if (parts.some((p) => p === 'tw' || p === 'hk' || p === 'mo')) return 'zh-TW'
      return base === 'yue' ? 'zh-TW' : 'zh-CN'
    }
    const code = base === 'in' ? 'id' : base
    if (isLocale(code)) return code
  }
  return 'en'
}

/** The browser's languages, most wanted first (`navigator.language` where the list is missing). */
export function browserLanguages(
  nav: Pick<Navigator, 'language' | 'languages'>,
): readonly string[] {
  if (nav.languages?.length) return nav.languages
  return nav.language ? [nav.language] : []
}

/**
 * The language on screen: every name helper and formatter reads it, so a
 * switch re-renders whatever used them.
 */
export const locale = ref<Locale>('en')
