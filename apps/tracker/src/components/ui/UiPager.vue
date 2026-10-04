<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { formatNumber } from '@/lib/format'

/**
 * Page navigation under a long list: the range shown, then previous, page
 * numbers (first, last and the current page's neighbours) and next. On a
 * phone only the arrows and "page / pages" remain. Renders nothing for a
 * single page.
 */
const props = withDefaults(
  defineProps<{ pageCount: number; total: number; pageSize: number; label?: string }>(),
  { label: 'Pages' },
)
const page = defineModel<number>({ required: true })

const from = computed(() => (props.total === 0 ? 0 : (page.value - 1) * props.pageSize + 1))
const to = computed(() => Math.min(props.total, page.value * props.pageSize))

/** 1 … 4 5 6 … 15, as numbers with null for a gap. */
const items = computed<(number | null)[]>(() => {
  const count = props.pageCount
  const current = page.value
  const out: (number | null)[] = []
  for (let n = 1; n <= count; n++) {
    if (n === 1 || n === count || Math.abs(n - current) <= 1) out.push(n)
    else if (out[out.length - 1] !== null) out.push(null)
  }
  return out
})

function go(n: number) {
  page.value = Math.min(props.pageCount, Math.max(1, n))
}

const ARROW =
  'inline-flex size-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent'
</script>

<template>
  <nav
    v-if="pageCount > 1"
    class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
    :aria-label="label"
  >
    <span class="tabular font-mono text-sm text-text-muted">
      {{ formatNumber(from) }}–{{ formatNumber(to) }} / {{ formatNumber(total) }}
    </span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :class="ARROW"
        aria-label="Previous page"
        title="Previous page"
        :disabled="page <= 1"
        @click="go(page - 1)"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </button>
      <span class="tabular px-1 font-mono text-sm sm:hidden">{{ page }} / {{ pageCount }}</span>
      <template v-for="(item, index) in items" :key="item ?? `gap-${index}`">
        <span v-if="item === null" class="hidden px-1 text-text-muted sm:inline" aria-hidden="true">
          …
        </span>
        <button
          v-else
          type="button"
          class="tabular hidden h-10 min-w-10 items-center justify-center rounded-lg px-2 font-mono text-sm transition-colors sm:inline-flex"
          :class="
            item === page
              ? 'bg-accent text-accent-ink'
              : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
          "
          :aria-current="item === page ? 'page' : undefined"
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        type="button"
        :class="ARROW"
        aria-label="Next page"
        title="Next page"
        :disabled="page >= pageCount"
        @click="go(page + 1)"
      >
        <ChevronRight class="size-5" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>
