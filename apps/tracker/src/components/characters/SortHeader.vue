<script setup lang="ts">
import { ArrowDown, ArrowUp } from 'lucide-vue-next'

/**
 * A sortable column header's button: the label plus an arrow while this
 * column is the sort. The <th> around it carries aria-sort.
 */
defineProps<{ label: string; active: boolean; direction: 'asc' | 'desc'; title?: string }>()
defineEmits<{ sort: [] }>()
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1 font-medium transition-colors hover:text-text-primary"
    :class="active ? 'text-text-primary' : ''"
    :title="title"
    @click="$emit('sort')"
  >
    {{ label }}
    <component
      :is="direction === 'asc' ? ArrowUp : ArrowDown"
      v-if="active"
      class="size-3.5"
      aria-hidden="true"
    />
  </button>
</template>
