import { describe, expect, it } from 'vitest'
import { linkOrigin, OLD_SITE_ORIGIN, SITE_ORIGIN } from '../lib/email'

const env = {} as Env

describe('linkOrigin', () => {
  it('keeps the site, its old address and loopback', () => {
    expect(SITE_ORIGIN).toBe('https://teyvat.me')
    expect(linkOrigin(env, 'https://teyvat.me/api/auth/x')).toBe('https://teyvat.me')
    expect(linkOrigin(env, `${OLD_SITE_ORIGIN}/api/auth/x`)).toBe(OLD_SITE_ORIGIN)
    expect(linkOrigin(env, 'http://localhost:5173/api/auth/x')).toBe('http://localhost:5173')
  })

  it('never follows a forged host', () => {
    expect(linkOrigin(env, 'https://evil.example/api/auth/x')).toBe(SITE_ORIGIN)
    expect(linkOrigin(env, 'https://teyvat.me.evil.example/api')).toBe(SITE_ORIGIN)
  })
})
