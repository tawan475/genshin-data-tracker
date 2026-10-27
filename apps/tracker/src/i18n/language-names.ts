import type { Locale } from './locale'

/** Each language named in itself, whatever the language on screen (pickers). */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  ru: 'Русский',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  de: 'Deutsch',
  id: 'Bahasa Indonesia',
  pt: 'Português',
  it: 'Italiano',
  tr: 'Türkçe',
}
