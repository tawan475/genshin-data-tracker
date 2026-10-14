import { ApiRequestError } from '@/api/http'
import { t, te } from './index'
import { locale } from './locale'

/** Codes whose server text names the exact problem (a field, a line): shown after ours. */
const WITH_DETAIL = new Set(['invalid_good', 'invalid_request'])

/**
 * An error as the user reads it. In English, the server's own message (it
 * carries the numbers: limits, sizes, UIDs) or the error's; in Chinese, the
 * message for the server's `code` (errors.api.*), with the server's detail
 * after it for file and form problems, else the error's own message. Errors
 * that are not Errors show `fallback` (or a generic line).
 */
export function errorText(error: unknown, fallback?: string): string {
  if (!(error instanceof Error)) return fallback ?? t('errors.unknown')
  if (locale.value === 'en' || !(error instanceof ApiRequestError)) return error.message
  const key = `errors.api.${error.code}`
  if (!te(key, locale.value)) {
    return error.status >= 500 ? t('errors.server') : error.message
  }
  const text = t(key)
  return WITH_DETAIL.has(error.code) && error.message
    ? t('errors.detail', { message: text, detail: error.message })
    : text
}
