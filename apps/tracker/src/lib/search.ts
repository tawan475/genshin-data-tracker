import { locale } from '@/i18n/locale'

/**
 * Search text in any script: accents dropped ("Sautéed" finds "sauteed"),
 * lower case, symbols removed, letters and digits of every language kept
 * (Chinese names stay searchable; the old [a-z0-9] filter deleted them).
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
}

const collators = new Map<string, Intl.Collator>()

/**
 * Compares two names in the language on screen: English as the browser
 * always did, Chinese by its own order (pinyin for Simplified, strokes for
 * Traditional). Built once per language.
 */
export function compareText(a: string, b: string): number {
  const tag = locale.value === 'en' ? '' : locale.value
  let collator = collators.get(tag)
  if (!collator) {
    collator = new Intl.Collator(tag || undefined)
    collators.set(tag, collator)
  }
  return collator.compare(a, b)
}
