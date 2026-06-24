import { ref, computed, type Ref } from 'vue'

export function useSnapshotSelection(
  snapshots: Ref<{ id: number }[]>,
  totalCount: Ref<number>,
) {
  const selectAll = ref(false)
  const selectedIds = ref<number[]>([])

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
    } else if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((i) => i !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  const isSelected = (id: number) => {
    if (selectAll.value) return true
    return selectedIds.value.includes(id)
  }

  const selectedCount = computed(() => {
    if (selectAll.value) return totalCount.value
    return selectedIds.value.length
  })

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
    resetSelection,
  }
}
