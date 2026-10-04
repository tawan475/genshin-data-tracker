import { computed, ref, type Ref } from 'vue'

/**
 * Row selection for the Import History table (the old dashboard's
 * useSnapshotSelection). Ids persist across pages; `selectAll` (the header
 * checkbox) covers every snapshot on every page. Unticking a row while
 * everything is selected leaves all the others selected: `snapshots` is the
 * full list here, where the old server-paginated table only had one page.
 */
export function useSnapshotSelection(
  snapshots: Ref<readonly { id: number }[]>,
  totalCount: Ref<number>,
) {
  const selectAll = ref(false)
  const selectedIds = ref<number[]>([])
  const selectedSet = computed(() => new Set(selectedIds.value))

  const toggleSelectAll = () => {
    selectAll.value = !selectAll.value
    if (!selectAll.value) {
      selectedIds.value = []
    }
  }

  const toggleSelection = (id: number) => {
    if (selectAll.value) {
      selectAll.value = false
      selectedIds.value = snapshots.value.filter((s) => s.id !== id).map((s) => s.id)
    } else if (selectedSet.value.has(id)) {
      selectedIds.value = selectedIds.value.filter((i) => i !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  const isSelected = (id: number) => {
    if (selectAll.value) return true
    return selectedSet.value.has(id)
  }

  const selectedCount = computed(() => {
    if (selectAll.value) return totalCount.value
    return selectedIds.value.length
  })

  /** The ids the selection covers right now. */
  const selectedIdList = (): number[] =>
    selectAll.value ? snapshots.value.map((s) => s.id) : [...selectedIds.value]

  /** Drops ids that are no longer in the list (deleted here or elsewhere). */
  const retain = (live: ReadonlySet<number>) => {
    if (selectedIds.value.some((id) => !live.has(id))) {
      selectedIds.value = selectedIds.value.filter((id) => live.has(id))
    }
  }

  const resetSelection = () => {
    selectAll.value = false
    selectedIds.value = []
  }

  return {
    selectAll,
    selectedIds,
    toggleSelectAll,
    toggleSelection,
    isSelected,
    selectedCount,
    selectedIdList,
    retain,
    resetSelection,
  }
}
