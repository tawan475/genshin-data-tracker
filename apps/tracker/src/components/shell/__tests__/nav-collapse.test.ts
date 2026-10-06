import { describe, expect, it } from 'vitest'
import { useNavCollapse, type FlagStore } from '../nav-collapse'

function memoryStore(initial: string | null = null): FlagStore & { value: string | null } {
  return {
    value: initial,
    read() {
      return this.value
    },
    write(value) {
      this.value = value
    },
  }
}

describe('useNavCollapse', () => {
  it('starts expanded when nothing is stored (or storage is unavailable)', () => {
    expect(useNavCollapse(memoryStore()).collapsed.value).toBe(false)
  })

  it('starts collapsed when a collapse was stored', () => {
    expect(useNavCollapse(memoryStore('1')).collapsed.value).toBe(true)
  })

  it('treats any other stored value as expanded', () => {
    for (const value of ['0', 'true', '', 'yes']) {
      expect(useNavCollapse(memoryStore(value)).collapsed.value).toBe(false)
    }
  })

  it('stores a collapse and clears the key on expand', () => {
    const store = memoryStore()
    const nav = useNavCollapse(store)

    nav.set(true)
    expect(nav.collapsed.value).toBe(true)
    expect(store.value).toBe('1')

    nav.set(false)
    expect(nav.collapsed.value).toBe(false)
    expect(store.value).toBeNull()
  })

  it('toggles, and a reload reads the last choice back', () => {
    const store = memoryStore()
    const nav = useNavCollapse(store)
    nav.toggle()
    expect(nav.collapsed.value).toBe(true)
    expect(useNavCollapse(store).collapsed.value).toBe(true)
    nav.toggle()
    expect(nav.collapsed.value).toBe(false)
    expect(useNavCollapse(store).collapsed.value).toBe(false)
  })

  it('keeps working for the session when nothing persists', () => {
    const nav = useNavCollapse({ read: () => null, write: () => {} })
    nav.toggle()
    expect(nav.collapsed.value).toBe(true)
    nav.toggle()
    expect(nav.collapsed.value).toBe(false)
  })
})
