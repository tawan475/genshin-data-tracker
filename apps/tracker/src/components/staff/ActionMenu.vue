<script setup lang="ts">
import { ref } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPopover from '@/components/ui/UiPopover.vue'

export interface MenuItem {
  label: string
  run: () => void
  danger?: boolean
  title?: string
}

/** "⋯": a short list of actions for whatever it sits next to. Nothing when there are none. */
defineProps<{ label: string; items: MenuItem[] }>()
const open = ref(false)
const anchor = ref<HTMLElement | null>(null)

function pick(item: MenuItem) {
  open.value = false
  item.run()
}
</script>

<template>
  <span v-if="items.length" ref="anchor" class="inline-flex">
    <UiIconButton :label="label" :active="open" @click="open = !open">
      <MoreHorizontal class="size-5" aria-hidden="true" />
    </UiIconButton>
    <UiPopover :open="open" :anchor="anchor" :label="label" :focus="false" @close="open = false">
      <div class="flex flex-col p-1.5" role="menu">
        <button
          v-for="item in items"
          :key="item.label"
          type="button"
          role="menuitem"
          class="rounded-md px-3 py-2.5 text-left text-[0.9375rem] font-medium transition-colors hover:bg-surface-overlay"
          :class="item.danger ? 'text-danger-text' : 'text-text-secondary hover:text-text-primary'"
          :title="item.title"
          @click="pick(item)"
        >
          {{ item.label }}
        </button>
      </div>
    </UiPopover>
  </span>
</template>
