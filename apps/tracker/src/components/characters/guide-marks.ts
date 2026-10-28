import type { SiteType } from '@/data/character-guides'

/**
 * The guide sites as the Guides section and dialog show them: the site's
 * own logo (a copy in public/guides, not hotlinked) and its name.
 */
export const GUIDE_SITES: Readonly<Record<SiteType, { name: string; logo: string }>> = {
  prydwen: { name: 'Prydwen', logo: '/guides/prydwen.webp' },
  kqm: { name: 'KQM', logo: '/guides/kqm.webp' },
  helper: { name: 'Helper Team', logo: '/guides/helper.webp' },
}

/** YouTube's logo (videos without a thumbnail, the Videos chip). */
export const YOUTUBE_LOGO = '/guides/youtube.webp'

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
