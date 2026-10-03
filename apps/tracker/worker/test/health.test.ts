import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { diagKeyOk } from '../routes/health'
import { ORIGIN, signUp } from './client'

const KEY = 'test-diag-key-test-diag-key-test-diag-key'

describe('health', () => {
  it('shows only the public tier without the diag key', async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/health`)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({ status: 'ok', db: 'ok' })
    expect(body).not.toHaveProperty('diagnostics')
    expect(JSON.stringify(body)).not.toContain('test-jwt-secret')
  })

  it('stays public for a wrong key and for a signed-in session', async () => {
    const wrong = await SELF.fetch(`${ORIGIN}/api/health`, { headers: { 'x-diag-key': `${KEY}x` } })
    expect(await wrong.json()).not.toHaveProperty('diagnostics')
    const { client } = await signUp()
    expect(await client.json<object>('/api/health')).not.toHaveProperty('diagnostics')
  })

  it('lists every secret with its value for the diag key', async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/health`, { headers: { 'x-diag-key': KEY } })
    const body = (await response.json()) as {
      diagnostics: { config: Record<string, unknown>; bindings: object }
    }
    expect(body.diagnostics.config).toEqual({
      JWT_SECRET: { set: true, value: 'test-jwt-secret-test-jwt-secret-0123456789' },
      PASSWORD_PEPPER: { set: true, value: 'test-pepper-test-pepper-test-pepper-0123' },
      DIAG_KEY: { set: true, value: KEY },
    })
    expect(body.diagnostics.bindings).toMatchObject({
      DB: true,
      AUTH_LIMITER: true,
      IMPORT_LIMITER: true,
    })
  })
})

describe('diagKeyOk', () => {
  it('fails closed', () => {
    for (const expected of [undefined, '']) {
      expect(diagKeyOk('', expected)).toBe(false)
      expect(diagKeyOk('anything', expected)).toBe(false)
    }
    expect(diagKeyOk(undefined, KEY)).toBe(false)
    expect(diagKeyOk('', KEY)).toBe(false)
  })

  it('accepts only the exact key', () => {
    expect(diagKeyOk(KEY, KEY)).toBe(true)
    expect(diagKeyOk(KEY.slice(0, -1), KEY)).toBe(false)
    expect(diagKeyOk(`${KEY}0`, KEY)).toBe(false)
    expect(diagKeyOk(KEY.replace('t', 'T'), KEY)).toBe(false)
  })
})
