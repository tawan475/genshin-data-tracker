import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  WISH_API_HOSTS,
  WISH_CACHE_URL_PATTERN,
  findWishLinkInCache,
  parseWishLink,
  redactAuthkey,
  wishApiUrl,
} from '../src'

const KEY = 'Synthetic0Key+only/for/tests=='
const ENCODED = encodeURIComponent(KEY)
const PAGE = `https://webstatic-sea.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html?win_mode=fullscreen&authkey_ver=1&sign_type=2&auth_appid=webview_gacha&init_type=301&gacha_id=abc&lang=en&device_type=pc&region=os_asia&authkey=${ENCODED}&game_biz=hk4e_global#/log`
const API = `https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog?win_mode=fullscreen&authkey_ver=1&sign_type=2&auth_appid=webview_gacha&init_type=301&lang=en&authkey=${ENCODED}&game_biz=hk4e_global&gacha_type=301&page=1&size=5&end_id=0`

describe('wish links', () => {
  it('reads the credential out of any wish history URL', () => {
    expect(parseWishLink(PAGE)).toEqual({
      authkey: KEY,
      authkeyVer: '1',
      signType: '2',
      gameBiz: 'hk4e_global',
      region: 'os_asia',
    })
    // Pasted with its key unescaped, inside other text (a phone's error page).
    expect(
      parseWishLink(
        `Webpage not available\nhttps://gs.hoyoverse.com/x?authkey=${KEY}&game_biz=hk4e_global done`,
      )?.authkey,
    ).toBe(KEY)
    // Parameters after the fragment, and a Chinese client by its host.
    expect(
      parseWishLink(`https://webstatic.mihoyo.com/hk4e/event/x/index.html#/log?authkey=${ENCODED}`),
    ).toMatchObject({ authkey: KEY, gameBiz: 'hk4e_cn' })
    expect(parseWishLink('https://example.com/?foo=bar')).toBeNull()
    expect(parseWishLink(`https://example.com/?authkey=short`)).toBeNull()
    expect(parseWishLink('no link here')).toBeNull()
  })

  it('builds API requests on the fixed host and path, with only the parameters it needs', () => {
    const link = parseWishLink(
      `https://evil.example/steal?authkey=${ENCODED}&game_biz=hk4e_global&callback=https://evil.example&region=os_euro`,
    )!
    const url = new URL(wishApiUrl(link, { gachaType: 302, page: 3, endId: '1790000000000000001' }))
    expect(url.origin).toBe(`https://${WISH_API_HOSTS.global}`)
    expect(url.pathname).toBe('/gacha_info/api/getGachaLog')
    expect([...url.searchParams.keys()].sort()).toEqual(
      [
        'auth_appid',
        'authkey',
        'authkey_ver',
        'end_id',
        'game_biz',
        'gacha_type',
        'init_type',
        'lang',
        'page',
        'region',
        'sign_type',
        'size',
      ].sort(),
    )
    expect(url.searchParams.get('authkey')).toBe(KEY)
    expect(url.searchParams.get('lang')).toBe('en-us')
    expect(url.href).toContain(encodeURIComponent('+'))
    const cn = wishApiUrl({ ...link, gameBiz: 'hk4e_cn' }, { gachaType: 301, page: 1, endId: '0' })
    expect(new URL(cn).host).toBe(WISH_API_HOSTS.cn)
  })

  it('finds the newest API URL in a web cache file, else the page', () => {
    const bytes = new Uint8Array([
      0,
      1,
      255,
      128,
      ...new TextEncoder().encode(`1/0/${PAGE}`),
      0,
      0,
      200,
      3,
      ...new TextEncoder().encode(`1/0/${API}`),
      0,
      9,
      250,
    ])
    // One character per byte, as the PowerShell script reads it.
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    // The match ends at game_biz's value (all the link needs).
    expect(findWishLinkInCache(text)).toBe(API.slice(0, API.indexOf('&gacha_type')))
    const pageOnly = text.replace(`1/0/${API}`, '')
    expect(findWishLinkInCache(pageOnly)).toBe(PAGE.replace('#/log', ''))
    expect(findWishLinkInCache('nothing')).toBeNull()
  })

  it('keeps wish-url.ps1 on the same pattern', () => {
    const script = readFileSync(
      new URL('../../../apps/tracker/public/wish-url.ps1', import.meta.url),
      'utf8',
    )
    expect(script).toContain(`'${WISH_CACHE_URL_PATTERN}'`)
    // ASCII only: PowerShell may read it in any code page.
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(script)).toBe(true)
  })

  it('redacts keys', () => {
    expect(redactAuthkey(API)).not.toContain(ENCODED)
    expect(redactAuthkey(API)).toContain('authkey=REDACTED')
  })
})
