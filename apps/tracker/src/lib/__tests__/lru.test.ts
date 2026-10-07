import { describe, expect, it } from 'vitest'
import { Lru } from '@/lib/lru'

describe('Lru', () => {
  it('drops the least recently used past the entry limit', () => {
    const lru = new Lru<string, number>(3)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('c', 3)
    expect(lru.get('a')).toBe(1) // a is now the newest
    lru.set('d', 4)
    expect(lru.keys()).toEqual(['c', 'a', 'd'])
    expect(lru.has('b')).toBe(false)
    expect(lru.size).toBe(3)
  })

  it('re-setting a key refreshes it without growing', () => {
    const lru = new Lru<string, number>(2)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('a', 10)
    lru.set('c', 3)
    expect(lru.keys()).toEqual(['a', 'c'])
    expect(lru.get('a')).toBe(10)
  })

  it('drops the oldest past the weight budget, keeps the newest even when heavy', () => {
    const lru = new Lru<string, string>(100, 10, (v) => v.length)
    lru.set('a', 'xxxx')
    lru.set('b', 'xxxx')
    expect(lru.weight).toBe(8)
    lru.set('c', 'xxxx')
    expect(lru.keys()).toEqual(['b', 'c'])
    expect(lru.weight).toBe(8)
    lru.set('huge', 'x'.repeat(50))
    expect(lru.keys()).toEqual(['huge'])
    expect(lru.weight).toBe(50)
  })

  it('deletes and reports misses', () => {
    const lru = new Lru<string, number>(2)
    expect(lru.get('nope')).toBeUndefined()
    lru.set('a', 1)
    expect(lru.delete('a')).toBe(true)
    expect(lru.delete('a')).toBe(false)
    expect(lru.size).toBe(0)
  })
})
