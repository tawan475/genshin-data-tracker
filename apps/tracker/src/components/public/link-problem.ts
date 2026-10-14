import { ApiRequestError } from '@/api'
import { t } from '@/i18n'
import { errorText } from '@/i18n/api-errors'

/** Why a one-time link (reset, email confirmation) can't be used, as the page says it. */
export interface LinkProblem {
  kind: 'expired' | 'used' | 'invalid' | 'email' | 'other'
  title: string
  text: string
}

export function linkProblem(cause: unknown): LinkProblem {
  const code = cause instanceof ApiRequestError ? cause.code : ''
  switch (code) {
    case 'token_expired':
      return {
        kind: 'expired',
        title: t('auth.linkProblem.expiredTitle'),
        text: t('auth.linkProblem.expired'),
      }
    case 'token_used':
      return {
        kind: 'used',
        title: t('auth.linkProblem.usedTitle'),
        text: t('auth.linkProblem.used'),
      }
    case 'token_invalid':
    case 'invalid_request':
      return {
        kind: 'invalid',
        title: t('auth.linkProblem.invalidTitle'),
        text: t('auth.linkProblem.invalid'),
      }
    case 'email_changed':
      return {
        kind: 'email',
        title: t('auth.linkProblem.emailTitle'),
        text: t('auth.linkProblem.email'),
      }
    default:
      return {
        kind: 'other',
        title: t('auth.linkProblem.otherTitle'),
        text: errorText(cause, t('common.requestFailed')),
      }
  }
}
