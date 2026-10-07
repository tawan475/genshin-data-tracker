<script setup lang="ts">
import { useSession } from '@/stores/session'

/**
 * A user as staff pages show one: initial, name and #id, linking to their
 * page when the viewer may open it (`users.view`).
 */
defineProps<{ user: { id: number; username: string }; size?: 'sm' | 'lg'; plain?: boolean }>()
const session = useSession()
</script>

<template>
  <component
    :is="!plain && session.can('users.view') ? 'RouterLink' : 'span'"
    :to="
      !plain && session.can('users.view')
        ? { name: 'staff-user', params: { userId: user.id } }
        : undefined
    "
    class="inline-flex min-w-0 items-center gap-2.5"
    :class="!plain && session.can('users.view') ? 'hover:text-accent-text' : ''"
  >
    <span
      class="flex shrink-0 items-center justify-center rounded-full bg-surface-overlay font-semibold text-text-secondary"
      :class="size === 'lg' ? 'size-14 text-xl' : 'size-8 text-[0.8125rem]'"
      aria-hidden="true"
      >{{ user.username.charAt(0).toUpperCase() }}</span
    >
    <span
      class="min-w-0 truncate font-medium"
      :class="size === 'lg' ? 'text-2xl font-semibold' : ''"
      >{{ user.username }}</span
    >
    <span class="tabular shrink-0 font-mono text-[0.8125rem] text-text-muted">#{{ user.id }}</span>
  </component>
</template>
