import { describe, expect, it } from 'vitest'
import { bagSections, parseFolded } from '../bag-sections'
import type { TabKey } from '../material-meta'

const items = (tab: TabKey, n: number) =>
  Array.from({ length: n }, (_, i) => ({ tab, key: `${tab}${i}` }))
const bag = [...items('food', 3), ...items('material', 4), ...items('other', 2)]
const brief = (out: ReturnType<typeof bagSections>) =>
  out.sections.map((s) => `${s.tab}:${s.items.length}/${s.total}${s.open ? '' : ' folded'}`)

describe('bag sections', () => {
  it('heads each tab and fills the page in order', () => {
    const out = bagSections(bag, new Set(), 5)
    expect(brief(out)).toEqual(['food:3/3', 'material:2/4'])
    expect(out.more).toBe(4)
  })

  it('shows everything when the page allows', () => {
    const out = bagSections(bag, new Set(), 100)
    expect(brief(out)).toEqual(['food:3/3', 'material:4/4', 'other:2/2'])
    expect(out.more).toBe(0)
  })

  it('folds a tab to its heading, which costs nothing from the page', () => {
    const out = bagSections(bag, new Set<TabKey>(['food']), 5)
    expect(brief(out)).toEqual(['food:0/3 folded', 'material:4/4', 'other:1/2'])
    expect(out.more).toBe(1)
  })

  it('never counts folded tabs as more to load', () => {
    const out = bagSections(bag, new Set<TabKey>(['material', 'other']), 3)
    expect(brief(out)).toEqual(['food:3/3', 'material:0/4 folded', 'other:0/2 folded'])
    expect(out.more).toBe(0)
  })

  it('stops at the first open tab the page has no room for', () => {
    // food fills the page exactly: material waits, and so does the folded tab after it.
    const out = bagSections(bag, new Set<TabKey>(['other']), 3)
    expect(brief(out)).toEqual(['food:3/3'])
    expect(out.more).toBe(4)
  })

  it('reads the stored folded tabs', () => {
    expect(parseFolded(null)).toEqual(new Set())
    expect(parseFolded('')).toEqual(new Set())
    expect(parseFolded('food,,other')).toEqual(new Set(['food', 'other']))
  })
})
