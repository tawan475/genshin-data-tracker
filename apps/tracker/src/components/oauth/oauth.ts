import {
  OAUTH_PROVIDERS,
  OAUTH_PROVIDER_LABELS,
  SIGNUP_MODES,
  type OAuthProvider,
  type SignupMode,
} from '@gdt/shared'
import { api } from '@/api'

export const providerLabel = (provider: OAuthProvider): string => OAUTH_PROVIDER_LABELS[provider]

export function isProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

/**
 * What the signed-out pages offer: the server's providers, whether email
 * features are on, the human check's site key (null while it is off), and
 * who may sign up (the staff switch).
 */
export interface SignInOptions {
  providers: OAuthProvider[]
  emailFeatures: boolean
  turnstileSiteKey: string | null
  signups: SignupMode
}

let options: Promise<SignInOptions> | null = null

/**
 * The server's sign-in options, asked once per page load (`fresh`: again,
 * as when the server asked for a human check this page didn't know of):
 * providers (none until their secrets are set), the email switch (off when
 * unsure) and the human check's site key.
 */
export function loadSignInOptions(fresh = false): Promise<SignInOptions> {
  if (fresh) options = null
  options ??= api
    .oauthProviders()
    .then((response) => ({
      providers: response.providers.filter(isProvider),
      emailFeatures: response.emailFeatures === true,
      turnstileSiteKey:
        typeof response.turnstileSiteKey === 'string' && response.turnstileSiteKey
          ? response.turnstileSiteKey
          : null,
      // An older Worker doesn't say: sign-ups are open there.
      signups: (SIGNUP_MODES as readonly string[]).includes(response.signups)
        ? response.signups
        : 'open',
    }))
    .catch(() => {
      options = null
      return {
        providers: [],
        emailFeatures: false,
        turnstileSiteKey: null,
        signups: 'open' as const,
      }
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
    case 'suspended':
      return 'This account is suspended'
    default:
      return 'Sign-in failed. Try again.'
  }
}
