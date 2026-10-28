import type { SiteType } from '@/data/character-guides'

/**
 * The guide sites as the Guides button, section and dialog show them: a
 * letter mark on the site's colour (never the sites' own favicons: a
 * third-party host), the name and its purpose label (an i18n key under
 * `characters.guides`; "Search" when the site has no page for the character).
 */
export const GUIDE_SITES: Readonly<
  Record<SiteType, { name: string; letter: string; color: string; purpose: string }>
> = {
  prydwen: { name: 'Prydwen', letter: 'P', color: '#5b4bd6', purpose: 'quickBuild' },
  kqm: { name: 'KQM', letter: 'K', color: '#1f8a7a', purpose: 'inDepth' },
  helper: { name: 'Helper Team', letter: 'H', color: '#c66a1c', purpose: 'buildSheet' },
}

/** YouTube's mark colour. */
export const YOUTUBE_RED = '#e11d48'

/** "prydwen.gg › raiden-shogun": a page's host and path, short. */
export function pageLabel(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.split('/').filter(Boolean).pop()
    return [u.hostname.replace(/^www\./, ''), path].filter(Boolean).join(' › ')
  } catch {
    return url
  }
}
