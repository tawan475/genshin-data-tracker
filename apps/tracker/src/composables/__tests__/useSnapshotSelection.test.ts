import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useSnapshotSelection } from '../useSnapshotSelection'

const rows = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i }))

describe('snapshot selection, Gmail-style', () => {
  const all = rows(1, 30)
  const page = all.slice(0, 10)

  it('the header selects the page only, then "Select all" takes the rest', () => {
    const s = useSnapshotSelection(ref(all))
    s.toggleView(page)
    expect(s.selectedCount.value).toBe(10)
    expect(s.coverage(page)).toBe('all')
    expect(s.coverage(all)).toBe('some')
    expect(s.allSelected.value).toBe(false)

    s.selectAll(all)
    expect(s.selectedCount.value).toBe(30)
    expect(s.allSelected.value).toBe(true)

    // The header on a fully selected page clears that page only.
    s.toggleView(page)
    expect(s.selectedCount.value).toBe(20)
    expect(s.coverage(page)).toBe('none')
  })

  it('"Select all" in a range keeps what was picked outside it', () => {
    const s = useSnapshotSelection(ref(all))
    s.toggle(30, all)
    s.selectAll(rows(1, 5))
    expect(s.selectedIdList()).toEqual([1, 2, 3, 4, 5, 30])
  })
})
