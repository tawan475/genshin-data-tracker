import { describe, expect, it, vi } from 'vitest'
import { routeAccountId } from '@/lib/route-account'
import { createSettingsCache } from '../settings-cache'

type Settings = { traveler: 'F' | 'M' }

function setup() {
  let stored: Settings = { traveler: 'F' }
  const read = vi.fn(async (_id: number) => ({ ...stored }))
  const write = vi.fn(async (_id: number, patch: Partial<Settings>) => {
    stored = { ...stored, ...patch }
    return { ...stored }
  })
  return { cache: createSettingsCache<Settings, Partial<Settings>>(read, write), read, write }
}

describe('settings cache', () => {
  it('shares one read between the pages that ask at once', async () => {
    const { cache, read } = setup()
    const [a, b] = await Promise.all([cache.load(1), cache.load(1)])
    expect(a).toBe(b)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("uses seeded settings (the bootstrap's) without a request", async () => {
    const { cache, read } = setup()
    cache.seed(2, { traveler: 'M' })
    expect((await cache.load(2)).traveler).toBe('M')
    expect(read).not.toHaveBeenCalled()
    // A fresh read asks the server.
    expect((await cache.load(2, { fresh: true })).traveler).toBe('F')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('reads again once dropped, and keeps what a save answers', async () => {
    const { cache, read } = setup()
    cache.seed(3, { traveler: 'M' })
    cache.drop(3)
    expect((await cache.load(3)).traveler).toBe('F')
    await cache.save(3, { traveler: 'M' })
    expect((await cache.load(3)).traveler).toBe('M')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('forgets a failed read', async () => {
    const { cache, read } = setup()
    read.mockRejectedValueOnce(new Error('offline'))
    await expect(cache.load(4)).rejects.toThrow('offline')
    expect((await cache.load(4)).traveler).toBe('F')
  })

  it('reads again after the reuse window', async () => {
    vi.useFakeTimers()
    try {
      const { cache, read } = setup()
      await cache.load(5)
      vi.advanceTimersByTime(61_000)
      await cache.load(5)
      expect(read).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('routeAccountId', () => {
  it('finds the account an app URL opens', () => {
    expect(routeAccountId('/app/a/12')).toBe(12)
    expect(routeAccountId('/app/a/12/characters')).toBe(12)
    expect(routeAccountId('/app/a/x')).toBeNull()
    expect(routeAccountId('/app/settings')).toBeNull()
    expect(routeAccountId('/app/staff/inspect/12/characters')).toBeNull()
  })
})
