import { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABELS, type OAuthProvider } from '@gdt/shared'
import { api } from '@/api'

export const providerLabel = (provider: OAuthProvider): string => OAUTH_PROVIDER_LABELS[provider]

export function isProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

let providers: Promise<OAuthProvider[]> | null = null

/** The server's sign-in providers (none until their secrets are set), asked once per page load. */
export function loadProviders(): Promise<OAuthProvider[]> {
  providers ??= api
    .oauthProviders()
    .then((response) => response.providers.filter(isProvider))
    .catch(() => {
      providers = null
      return []
    })
  return providers
}

/** What a provider round trip's `?oauth_error=` code means, in a few words. */
export function oauthErrorText(code: unknown): string {
  switch (code) {
    case 'unavailable':
      return 'That sign-in is off'
    case 'state':
      return "Sign-in didn't finish. Try again."
    case 'expired':
      return 'Took too long. Try again.'
    case 'denied':
      return 'Cancelled'
    case 'session':
      return 'Your session changed meanwhile. Try again.'
    case 'taken':
      return 'That account is linked to another user'
    case 'already':
      return 'Another account of that provider is linked. Unlink it first.'
    case 'rate_limited':
      return 'Too many tries. Wait a minute.'
    default:
      return 'Sign-in failed. Try again.'
  }
}
