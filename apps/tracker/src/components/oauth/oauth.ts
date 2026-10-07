import { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABELS, type OAuthProvider } from '@gdt/shared'
import { api } from '@/api'

export const providerLabel = (provider: OAuthProvider): string => OAUTH_PROVIDER_LABELS[provider]

export function isProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

/** What the signed-out pages offer: the server's providers, and whether email features are on. */
export interface SignInOptions {
  providers: OAuthProvider[]
  emailFeatures: boolean
}

let options: Promise<SignInOptions> | null = null

/**
 * The server's sign-in options, asked once per page load: providers (none
 * until their secrets are set) and the email switch (off when unsure).
 */
export function loadSignInOptions(): Promise<SignInOptions> {
  options ??= api
    .oauthProviders()
    .then((response) => ({
      providers: response.providers.filter(isProvider),
      emailFeatures: response.emailFeatures === true,
    }))
    .catch(() => {
      options = null
      return { providers: [], emailFeatures: false }
    })
  return options
}

/** "Discord or Google": the providers named for a line of text. */
export const providerNames = (providers: readonly OAuthProvider[]): string =>
  providers.map(providerLabel).join(' or ')

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
