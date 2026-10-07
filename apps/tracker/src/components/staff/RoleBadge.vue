<script setup lang="ts">
import type { RoleRef } from '@gdt/shared'
import UiBadge from '@/components/ui/UiBadge.vue'

/** A role: its colour as a dot, then its name. */
defineProps<{ role: Pick<RoleRef, 'name' | 'color'> }>()
</script>

<template>
  <UiBadge>
    <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: role.color }" />
    {{ role.name }}
    <slot />
  </UiBadge>
</template>
