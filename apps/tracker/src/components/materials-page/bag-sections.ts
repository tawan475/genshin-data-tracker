import type { TabKey } from './material-meta'

export interface BagSection<T> {
  tab: TabKey
  /** Every item of the tab, so a folded heading still counts them. */
  total: number
  /** The items rendered now: none when folded, else what the page allows. */
  items: T[]
  open: boolean
}

/**
 * All, in the game's order, as a heading per tab (the tabs follow one
 * another in `items`). Folded tabs render no tiles and cost nothing from
 * the page, so folding a long tab brings the next ones into view. Stops at
 * the first open tab the page has no room left for; `more` is what open
 * tabs still hold.
 */
export function bagSections<T extends { tab: TabKey }>(
  items: readonly T[],
  folded: ReadonlySet<TabKey>,
  limit: number,
): { sections: BagSection<T>[]; more: number } {
  const groups: { tab: TabKey; items: T[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last?.tab === item.tab) last.items.push(item)
    else groups.push({ tab: item.tab, items: [item] })
  }

  const sections: BagSection<T>[] = []
  let budget = limit
  let more = 0
  let full = false
  for (const group of groups) {
    const open = !folded.has(group.tab)
    if (!open) {
      if (!full) sections.push({ tab: group.tab, total: group.items.length, items: [], open })
      continue
    }
    if (full || budget <= 0) {
      full = true
      more += group.items.length
      continue
    }
    const shown = group.items.slice(0, budget)
    budget -= shown.length
    more += group.items.length - shown.length
    if (shown.length < group.items.length) full = true
    sections.push({ tab: group.tab, total: group.items.length, items: shown, open })
  }
  return { sections, more }
}

/** Folded tabs as stored per device: a comma-separated list. */
export function parseFolded(raw: string | null): Set<TabKey> {
  if (!raw) return new Set()
  return new Set(raw.split(',').filter(Boolean) as TabKey[])
}
