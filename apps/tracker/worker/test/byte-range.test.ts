import { describe, expect, it } from 'vitest'
import { parseRange, withRange } from '../lib/byte-range'

describe('parseRange', () => {
  it('reads one bytes= range, open-ended and suffix ranges too', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 })
  })

  it('refuses what is outside the body, and answers several ranges whole', () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid')
    expect(parseRange('bytes=9-1', 100)).toBe('invalid')
    expect(parseRange('bytes=-0', 100)).toBe('invalid')
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
    expect(parseRange('items=0-1', 100)).toBeNull()
  })
})

describe('withRange', () => {
  const asset = () =>
    new Response(new Uint8Array([...Array(10).keys()]), {
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': '10' },
    })

  it('answers a range with 206 and the slice', async () => {
    const res = await withRange(
      new Request('https://x/landing/a.mp4', { headers: { Range: 'bytes=2-4' } }),
      asset(),
    )
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 2-4/10')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([2, 3, 4])
  })

  it('answers whole without a range, 416 outside the body', async () => {
    const whole = await withRange(new Request('https://x/landing/a.mp4'), asset())
    expect(whole.status).toBe(200)
    expect(whole.headers.get('Accept-Ranges')).toBe('bytes')
    expect((await whole.arrayBuffer()).byteLength).toBe(10)
    const bad = await withRange(
      new Request('https://x/landing/a.mp4', { headers: { Range: 'bytes=20-' } }),
      asset(),
    )
    expect(bad.status).toBe(416)
    expect(bad.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('passes other answers through', async () => {
    const missing = new Response('no', { status: 404 })
    expect(await withRange(new Request('https://x/landing/b.mp4'), missing)).toBe(missing)
  })
})
