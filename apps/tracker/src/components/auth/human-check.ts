import { ApiRequestError } from '@/api'
import { loadSignInOptions } from '@/components/oauth/oauth'

export { HUMAN_CHECK_WAIT, humanCheckPassed } from './human-check-state'

/** What a form says when the server asked for a human check it didn't render. */
export const HUMAN_CHECK_NEEDED = 'Human check needed. Try again.'

/**
 * After a refused submit: when the server asked for a human check this page
 * didn't know of (turned on since the page read its options), the site key
 * to render one with, read again; null for any other refusal.
 */
export async function siteKeyAfter(cause: unknown): Promise<string | null> {
  if (!(cause instanceof ApiRequestError) || cause.code !== 'human_check_required') return null
  return (await loadSignInOptions(true)).turnstileSiteKey
}
