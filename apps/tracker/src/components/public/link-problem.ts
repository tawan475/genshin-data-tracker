import { ApiRequestError } from '@/api'

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
      return { kind: 'expired', title: 'Link expired', text: 'This link has expired.' }
    case 'token_used':
      return { kind: 'used', title: 'Link used', text: 'This link was already used.' }
    case 'token_invalid':
    case 'invalid_request':
      return { kind: 'invalid', title: 'Link not valid', text: "This link isn't valid." }
    case 'email_changed':
      return {
        kind: 'email',
        title: 'Email changed',
        text: 'The email changed after this link was sent.',
      }
    default:
      return {
        kind: 'other',
        title: 'Something went wrong',
        text: cause instanceof Error ? cause.message : 'Request failed',
      }
  }
}
