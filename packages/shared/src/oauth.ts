/**
 * Sign-in providers (OAuth). Each is on only while the Worker has its client
 * id and secret; `GET /api/auth/oauth/providers` says which.
 */
export const OAUTH_PROVIDERS = ['discord', 'google'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  discord: 'Discord',
  google: 'Google',
}
