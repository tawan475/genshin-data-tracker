<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'

defineProps<{
  title?: string
  description?: string
  flush?: boolean
  /** The header folds the body away (`v-model:open`, open by default). */
  collapsible?: boolean
}>()
const open = defineModel<boolean>('open', { default: true })
</script>

<template>
  <section class="rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <!-- min-h: as tall as a header holding an sm button, so panels side by side line up. -->
    <header
      v-if="title || $slots.actions || $slots.header"
      class="flex min-h-[calc(3.75rem+1px)] flex-wrap items-center justify-between gap-3 px-5 py-3.5"
      :class="!collapsible || open ? 'border-b border-border-default' : ''"
    >
      <slot name="header">
        <button
          v-if="collapsible"
          type="button"
          class="-my-1 flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
          :aria-expanded="open"
          @click="open = !open"
        >
          <ChevronDown
            class="size-4 shrink-0 text-text-muted transition-transform"
            :class="open ? '' : '-rotate-90'"
            aria-hidden="true"
          />
          <span class="min-w-0">
            <h2 class="text-base font-semibold">{{ title }}</h2>
            <p v-if="description" class="text-sm text-text-muted">{{ description }}</p>
          </span>
        </button>
        <div v-else class="min-w-0">
          <h2 class="text-base font-semibold">{{ title }}</h2>
          <p v-if="description" class="text-sm text-text-muted">{{ description }}</p>
        </div>
      </slot>
      <!-- min-w-0: a row of actions that scrolls sideways on phones stays inside the header. -->
      <div v-if="$slots.actions" class="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
      <button
        v-if="collapsible && $slots.header"
        type="button"
        class="grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-overlay hover:text-text-primary"
        :aria-expanded="open"
        :aria-label="title"
        @click="open = !open"
      >
        <ChevronDown
          class="size-4 transition-transform"
          :class="open ? '' : '-rotate-90'"
          aria-hidden="true"
        />
      </button>
    </header>
    <div v-show="!collapsible || open" :class="flush ? '' : 'p-5'">
      <slot />
    </div>
  </section>
</template>
