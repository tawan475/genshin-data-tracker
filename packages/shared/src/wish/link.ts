/**
 * The game's wish history link (the "traditional" import, as paimon.moe
 * does it): the URL the in-game Wish → History page leaves in the game's
 * web cache, which the tracker's PowerShell script (apps/tracker/public/
 * wish-url.ps1) copies, or that a phone shows. It carries an `authkey`
 * that reads the account's wish history for about a day: a password while
 * it lasts, never stored or logged.
 *
 * Whatever host the pasted link names (webstatic-sea, hk4e-api-os,
 * gs.hoyoverse.com…), only its credential parameters are kept; requests go
 * to the wish history API on one of two fixed hosts, which is what keeps
 * the tracker's proxy (POST /api/wishes/fetch-page) from fetching anything
 * else.
 */

export const WISH_API_HOSTS = {
  global: 'public-operation-hk4e-sg.hoyoverse.com',
  cn: 'public-operation-hk4e.mihoyo.com',
} as const
export const WISH_API_PATH = '/gacha_info/api/getGachaLog'
/** Records per page the API gives at most. */
export const WISH_PAGE_SIZE = 20

export interface WishLink {
  authkey: string
  authkeyVer: string
  signType: string
  gameBiz: 'hk4e_global' | 'hk4e_cn'
  /** `os_asia`…, when the link says. */
  region: string | null
}

const AUTHKEY = /^[A-Za-z0-9+/=_-]{16,4096}$/
const DIGITS = /^\d{1,3}$/
const REGION = /^[a-z0-9_]{1,24}$/

/**
 * The cache and copied text hold URLs among other bytes: printable ASCII
 * from `https://` up to `game_biz=<value>`, with `webview_gacha` in between
 * (the same pattern wish-url.ps1 uses; a test keeps them alike).
 */
export const WISH_CACHE_URL_PATTERN = 'https://[!-~]+?webview_gacha[!-~]*?game_biz=[A-Za-z0-9_]+'

/**
 * The wish link in raw web cache text: the last getGachaLog API URL with an
 * authkey, else the last of any kind (the history page's own).
 */
export function findWishLinkInCache(text: string): string | null {
  let api: string | null = null
  let any: string | null = null
  for (const match of text.matchAll(new RegExp(WISH_CACHE_URL_PATTERN, 'g'))) {
    const url = match[0]
    if (!url.includes('authkey=')) continue
    if (url.includes('getGachaLog')) api = url
    any = url
  }
  return api ?? any
}

/** A query string's parameters; `+` stays `+` (authkeys are base64), unlike URLSearchParams. */
function queryOf(query: string, into: Map<string, string>): void {
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    try {
      const key = decodeURIComponent(part.slice(0, eq))
      if (!into.has(key)) into.set(key, decodeURIComponent(part.slice(eq + 1)))
    } catch {
      // A malformed escape: not one of ours.
    }
  }
}

/** The query parameters of a URL, its fragment's too (the history page keeps them after `#/…?`). */
function paramsOf(url: URL): Map<string, string> {
  const params = new Map<string, string>()
  queryOf(url.search.slice(1), params)
  const hash = url.hash.indexOf('?')
  if (hash >= 0) queryOf(url.hash.slice(hash + 1), params)
  return params
}

/**
 * The wish link in pasted text (the URL alone, a whole copied page, or the
 * cache's bytes): the last URL carrying an authkey. null when there is none
 * or its authkey is not one.
 */
export function parseWishLink(text: string): WishLink | null {
  const candidates = text.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  for (const candidate of candidates.reverse()) {
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      continue
    }
    const params = paramsOf(url)
    const authkey = params.get('authkey')
    if (!authkey || !AUTHKEY.test(authkey)) continue
    const biz = params.get('game_biz')
    const cn = biz === 'hk4e_cn' || (!biz && /(^|\.)mihoyo\.com$/i.test(url.hostname))
    const authkeyVer = params.get('authkey_ver') ?? '1'
    const signType = params.get('sign_type') ?? '2'
    const region = params.get('region')
    return {
      authkey,
      authkeyVer: DIGITS.test(authkeyVer) ? authkeyVer : '1',
      signType: DIGITS.test(signType) ? signType : '2',
      gameBiz: cn ? 'hk4e_cn' : 'hk4e_global',
      region: region && REGION.test(region) ? region : null,
    }
  }
  return null
}

/** One page of the wish history API, built from scratch: fixed host and path, only these parameters. */
export function wishApiUrl(
  link: WishLink,
  query: { gachaType: number; page: number; endId: string; size?: number },
): string {
  const url = new URL(
    `https://${link.gameBiz === 'hk4e_cn' ? WISH_API_HOSTS.cn : WISH_API_HOSTS.global}${WISH_API_PATH}`,
  )
  const params: [string, string][] = [
    ['authkey_ver', link.authkeyVer],
    ['sign_type', link.signType],
    ['auth_appid', 'webview_gacha'],
    ['init_type', '301'],
    ['lang', 'en-us'],
    ['gacha_type', String(query.gachaType)],
    ['page', String(query.page)],
    ['size', String(query.size ?? WISH_PAGE_SIZE)],
    ['end_id', query.endId],
    ['authkey', link.authkey],
    ['game_biz', link.gameBiz],
  ]
  if (link.region) params.push(['region', link.region])
  for (const [key, value] of params) url.searchParams.set(key, value)
  return url.href
}

/** Text with every authkey value blanked (for errors and logs). */
export function redactAuthkey(text: string): string {
  return text.replace(/(authkey=)[^&\s"'#]+/gi, '$1REDACTED')
}
