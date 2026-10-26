import { describe, expect, it } from 'vitest'
import { newerBookmark, readBookmark, sessionStart } from '../lib/d1-session'
import { ORIGIN, signUp } from './client'

const A = '00000000-0000001e-00000000-00000000000000000000000000000000'
const B = '00000000-00000020-00000000-00000000000000000000000000000000'

describe('D1 sessions (read replication)', () => {
  it('starts writes at the primary and reads at the bookmark', () => {
    expect(sessionStart('POST', A)).toBe('first-primary')
    expect(sessionStart('DELETE', null)).toBe('first-primary')
    expect(sessionStart('GET', A)).toBe(A)
    expect(sessionStart('GET', null)).toBe('first-unconstrained')
  })

  it('keeps the newer bookmark and drops what is not one', () => {
    expect(newerBookmark(A, B)).toBe(B)
    expect(newerBookmark(B, A)).toBe(B)
    expect(newerBookmark(null, A)).toBe(A)
    expect(readBookmark('first-primary')).toBeNull()
    expect(readBookmark(`${A}x`)).toBeNull()
    expect(readBookmark(A)).toBe(A)
  })

  it('answers with the bookmark; only a write moves the cookie', async () => {
    const { client } = await signUp()
    const write = await client.fetch('/api/accounts', { method: 'POST', json: { name: 'Main' } })
    expect(write.status).toBe(201)
    const written = write.headers.get('x-gdt-bookmark')
    expect(readBookmark(written)).toBe(written)
    expect(client.cookie('gdt_d1')).toBe(written)

    const read = await client.fetch('/api/accounts', { headers: { 'x-gdt-bookmark': written! } })
    expect(read.status).toBe(200)
    expect(read.headers.get('x-gdt-bookmark')! >= written!).toBe(true)
    expect(read.headers.getSetCookie().some((line) => line.startsWith('gdt_d1='))).toBe(false)
  })

  it('gives live events the bookmark of the write they report', async () => {
    const { client } = await signUp()
    const response = await client.fetch('/api/live', {
      headers: { upgrade: 'websocket', origin: ORIGIN },
    })
    expect(response.status).toBe(101)
    const socket = response.webSocket!
    socket.accept()
    const messages: Record<string, unknown>[] = []
    socket.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))))
    const until = async (n: number) => {
      for (let i = 0; i < 100 && messages.length < n; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }
    await until(1)
    expect(messages[0]!.type).toBe('hello')
    expect(readBookmark(messages[0]!.d1 as string)).toBe(messages[0]!.d1)

    const write = await client.fetch('/api/accounts', { method: 'POST', json: { name: 'Main' } })
    await until(2)
    expect(messages[1]).toMatchObject({ type: 'accounts', d1: write.headers.get('x-gdt-bookmark') })
    socket.close()
  })

  it('ignores a bookmark that is not one', async () => {
    const { client } = await signUp()
    client.setCookie('gdt_d1', 'junk', '/api')
    const read = await client.fetch('/api/accounts', {
      headers: { 'x-gdt-bookmark': 'first-primary' },
    })
    expect(read.status).toBe(200)
  })
})
