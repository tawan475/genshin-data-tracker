import { callbackUrl, cleanDeviceName, isLoopbackRedirect, parseLinkQuery } from '@gdt/shared'
import { describe, expect, it } from 'vitest'

/** What irminsul opens /link with, as vue-router hands the page its query. */
const GOOD = {
  client_id: 'irminsul',
  redirect_uri: 'http://127.0.0.1:53682/callback',
  state: 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0',
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
  device: 'GAMING-PC',
}

const problem = (query: Record<string, unknown>) => {
  const result = parseLinkQuery(query)
  return result.ok ? null : result.problem
}

describe('the /link query', () => {
  it('takes what irminsul sends', () => {
    expect(parseLinkQuery(GOOD)).toEqual({
      ok: true,
      value: {
        redirectUri: GOOD.redirect_uri,
        state: GOOD.state,
        codeChallenge: GOOD.code_challenge,
        device: 'GAMING-PC',
      },
    })
    expect(problem({ ...GOOD, redirect_uri: 'http://localhost:1/callback' })).toBeNull()
    expect(problem({ ...GOOD, redirect_uri: 'http://127.0.0.1:65535/callback' })).toBeNull()
  })

  it('refuses another client', () => {
    expect(problem({ ...GOOD, client_id: 'other' })).toBe('client')
    expect(problem({ ...GOOD, client_id: undefined })).toBe('client')
    expect(problem({ ...GOOD, client_id: ['irminsul', 'irminsul'] })).toBe('client')
  })

  it('refuses any redirect but a loopback callback', () => {
    for (const redirect of [
      undefined,
      '',
      'https://evil.example/callback',
      'http://127.0.0.1/callback',
      'http://127.0.0.1:0/callback',
      'http://127.0.0.1:65536/callback',
      'http://127.0.0.1:080/callback',
      'http://127.0.0.1:8080/callback/',
      'http://127.0.0.1:8080/callback?next=x',
      'http://127.0.0.1:8080/callback#x',
      'http://127.0.0.1:8080/other',
      'http://127.0.0.1.evil.example:8080/callback',
      'http://localhost.evil.example:8080/callback',
      'http://user@127.0.0.1:8080/callback',
      'http://[::1]:8080/callback',
      'https://127.0.0.1:8080/callback',
      'javascript:alert(1)//http://127.0.0.1:8080/callback',
    ]) {
      expect(problem({ ...GOOD, redirect_uri: redirect }), String(redirect)).toBe('redirect')
      expect(isLoopbackRedirect(redirect), String(redirect)).toBe(false)
    }
  })

  it('needs an S256 challenge and a state', () => {
    expect(problem({ ...GOOD, code_challenge_method: 'plain' })).toBe('challenge')
    expect(problem({ ...GOOD, code_challenge_method: undefined })).toBe('challenge')
    expect(problem({ ...GOOD, code_challenge: 'short' })).toBe('challenge')
    expect(problem({ ...GOOD, code_challenge: `${GOOD.code_challenge}=` })).toBe('challenge')
    expect(problem({ ...GOOD, code_challenge: GOOD.code_challenge.replace('-', '+') })).toBe(
      'challenge',
    )
    expect(problem({ ...GOOD, state: undefined })).toBe('state')
    expect(problem({ ...GOOD, state: 'short' })).toBe('state')
    expect(problem({ ...GOOD, state: 'has spaces in it, sixteen+' })).toBe('state')
  })

  it('cleans the device name and does without one', () => {
    expect(cleanDeviceName('  Living\u0000room\n  PC  ')).toBe('Living room PC')
    expect(cleanDeviceName('x'.repeat(100))).toHaveLength(64)
    expect(cleanDeviceName(`${String.fromCharCode(0x202e)}evil`)).toBe('evil')
    const result = parseLinkQuery({ ...GOOD, device: undefined })
    expect(result.ok && result.value.device).toBe('')
  })

  it('builds the callback with the code and the state', () => {
    expect(callbackUrl(GOOD.redirect_uri, { code: 'abc', state: GOOD.state })).toBe(
      `http://127.0.0.1:53682/callback?code=abc&state=${GOOD.state}`,
    )
    expect(callbackUrl(GOOD.redirect_uri, { error: 'access_denied', state: 'a&b' })).toBe(
      'http://127.0.0.1:53682/callback?error=access_denied&state=a%26b',
    )
  })
})
