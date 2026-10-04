import { computed, shallowRef, type Ref } from 'vue'

type Row = { id: number }

/**
 * Row selection for the Import History table. Ids persist across pages and
 * date filters. A plain click toggles one row; a shift-click applies that
 * row's new state to every row between it and the last clicked one, in the
 * order of the list the click came from (the filtered list, across pages).
 */
export function useSnapshotSelection(snapshots: Ref<readonly Row[]>) {
  const selected = shallowRef<ReadonlySet<number>>(new Set())
  /** The last row clicked, where a shift-click range starts. */
  let anchor: number | null = null

  const selectedCount = computed(() => selected.value.size)
  const isSelected = (id: number) => selected.value.has(id)

  /** Every snapshot of the account is selected. */
  const allSelected = computed(
    () => snapshots.value.length > 0 && selected.value.size === snapshots.value.length,
  )

  function setMany(ids: Iterable<number>, on: boolean) {
    const next = new Set(selected.value)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    selected.value = next
  }

  /** Toggles `id`; with `range`, from the last clicked row to `id` within `view`. */
  function toggle(id: number, view: readonly Row[], range = false) {
    const on = !selected.value.has(id)
    if (range && anchor !== null && anchor !== id) {
      const from = view.findIndex((s) => s.id === anchor)
      const to = view.findIndex((s) => s.id === id)
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        setMany(
          view.slice(lo, hi + 1).map((s) => s.id),
          on,
        )
        anchor = id
        return
      }
    }
    setMany([id], on)
    anchor = id
  }

  /** How much of `view` is selected. */
  function coverage(view: readonly Row[]): 'none' | 'some' | 'all' {
    let count = 0
    for (const { id } of view) if (selected.value.has(id)) count++
    if (count === 0) return 'none'
    return count === view.length ? 'all' : 'some'
  }

  /** The header checkbox: selects all of `view`, or clears it when all are selected. */
  function toggleView(view: readonly Row[]) {
    if (view.length === 0) return
    setMany(
      view.map((s) => s.id),
      coverage(view) !== 'all',
    )
  }

  /** Replaces the selection with `view`. */
  function selectOnly(view: readonly Row[]) {
    selected.value = new Set(view.map((s) => s.id))
    anchor = null
  }

  /** The selected ids, newest first. */
  const selectedIdList = (): number[] =>
    snapshots.value.filter((s) => selected.value.has(s.id)).map((s) => s.id)

  /** Drops ids that are no longer in the list (deleted here or elsewhere). */
  const retain = (live: ReadonlySet<number>) => {
    if ([...selected.value].some((id) => !live.has(id))) {
      selected.value = new Set([...selected.value].filter((id) => live.has(id)))
    }
  }

  const resetSelection = () => {
    selected.value = new Set()
    anchor = null
  }

  return {
    selected,
    selectedCount,
    allSelected,
    isSelected,
    toggle,
    coverage,
    toggleView,
    selectOnly,
    selectedIdList,
    retain,
    resetSelection,
  }
}
