<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'

/**
 * The share card's options: its theme, and whether it shows the account
 * name and the UID. `compact` lays them out for the details header (icon
 * theme switch, two toggle chips); otherwise as a form (the phone menu).
 * Arrow keys stay here: in the details they would also step to the next
 * character.
 */
defineProps<{ compact?: boolean }>()
const theme = defineModel<'light' | 'dark'>('theme', { required: true })
const name = defineModel<boolean>('name', { required: true })
const uid = defineModel<boolean>('uid', { required: true })

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
    <UiSegmented v-model="theme" :options="themes" label="Card theme" icon-only />
    <FilterChip
      :pressed="name"
      class="min-h-8! px-2.5!"
      title="Show the account name"
      @toggle="name = !name"
      >Name</FilterChip
    >
    <FilterChip :pressed="uid" class="min-h-8! px-2.5!" title="Show the UID" @toggle="uid = !uid"
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
      v-model="theme"
      :options="themes.map((t) => ({ ...t, label: t.value === 'dark' ? 'Dark' : 'Light' }))"
      label="Card theme"
      size="md"
      class="self-start"
    />
    <UiSwitch v-model="name" label="Name" />
    <UiSwitch v-model="uid" label="UID" />
  </div>
</template>
