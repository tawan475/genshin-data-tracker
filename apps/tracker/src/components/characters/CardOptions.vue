<script setup lang="ts">
import { nextTick } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'

/**
 * The share card's options: its theme, and whether it shows the account
 * name and the UID. `compact` lays them out for the details header (icon
 * theme switch, two toggle chips); otherwise as a form (the phone menu).
 * Arrow keys stay here: in the details they would also step to the next
 * character. `themeOnly` leaves out the name and UID (a card that shows
 * neither, the artifact's).
 */
defineProps<{ compact?: boolean; themeOnly?: boolean }>()
const theme = defineModel<'light' | 'dark'>('theme', { required: true })
const name = defineModel<boolean>('name', { default: false })
const uid = defineModel<boolean>('uid', { default: false })

/**
 * A theme swap crossfades the page (View Transitions): the card fades from one
 * theme to the other instead of jumping (instant without the API or with
 * reduced motion).
 */
function setTheme(next: 'light' | 'dark') {
  if (next === theme.value) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!('startViewTransition' in document) || reduced) {
    theme.value = next
    return
  }
  document.startViewTransition(async () => {
    theme.value = next
    await nextTick()
  })
}

const themes = [
  { value: 'dark' as const, label: 'Dark card', icon: Moon },
  { value: 'light' as const, label: 'Light card', icon: Sun },
]
</script>

<template>
  <div
    v-if="compact"
    class="flex items-center gap-1.5"
    @keydown.left.stop
    @keydown.right.stop
    @keydown.up.stop
    @keydown.down.stop
  >
    <UiSegmented
      :model-value="theme"
      :options="themes"
      label="Card theme"
      icon-only
      @update:model-value="setTheme"
    />
    <FilterChip
      v-if="!themeOnly"
      :pressed="name"
      class="min-h-8! px-2.5!"
      title="Show the account name"
      @toggle="name = !name"
      >Name</FilterChip
    >
    <FilterChip
      v-if="!themeOnly"
      :pressed="uid"
      class="min-h-8! px-2.5!"
      title="Show the UID"
      @toggle="uid = !uid"
      >UID</FilterChip
    >
  </div>
  <div
    v-else
    class="flex flex-col gap-1"
    @keydown.left.stop
    @keydown.right.stop
    @keydown.up.stop
    @keydown.down.stop
  >
    <UiSegmented
      :model-value="theme"
      :options="themes.map((t) => ({ ...t, label: t.value === 'dark' ? 'Dark' : 'Light' }))"
      label="Card theme"
      size="md"
      class="self-start"
      @update:model-value="setTheme"
    />
    <template v-if="!themeOnly">
      <UiSwitch v-model="name" label="Name" />
      <UiSwitch v-model="uid" label="UID" />
    </template>
  </div>
</template>
