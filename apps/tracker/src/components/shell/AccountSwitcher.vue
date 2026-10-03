<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { Check, ChevronsUpDown, Plus } from 'lucide-vue-next'
import { useAccounts } from '@/stores/accounts'

/** Shows the current Genshin account and switches between them. */
const props = defineProps<{ currentId: number | null }>()
const accounts = useAccounts()
const route = useRoute()
const open = ref(false)
const root = ref<HTMLElement>()
onClickOutside(root, () => (open.value = false))

const current = computed(() => (props.currentId ? accounts.byId.get(props.currentId) : undefined))

/** Keep the same section when switching accounts. */
function targetFor(id: number) {
  const name =
    typeof route.name === 'string' && route.name.startsWith('account-')
      ? route.name
      : 'account-overview'
  return { name, params: { accountId: id } }
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-left hover:bg-surface-overlay"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate font-medium">
          {{ current ? accounts.displayName(current) : 'Choose an account' }}
        </span>
        <span v-if="current?.uid" class="truncate font-mono text-sm text-text-muted">{{
          current.uid
        }}</span>
      </span>
      <ChevronsUpDown class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-overlay"
      role="listbox"
    >
      <RouterLink
        v-for="account in accounts.list"
        :key="account.id"
        :to="targetFor(account.id)"
        role="option"
        :aria-selected="account.id === currentId"
        class="flex min-h-11 items-center gap-3 px-3 py-2 hover:bg-surface-overlay"
        @click="open = false"
      >
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate">{{ accounts.displayName(account) }}</span>
          <span class="truncate font-mono text-sm text-text-muted">
            {{ account.uid ?? 'No UID' }} · {{ account.snapshotCount }} snapshots
          </span>
        </span>
        <Check v-if="account.id === currentId" class="size-4 text-accent-text" aria-hidden="true" />
      </RouterLink>
      <RouterLink
        :to="{ name: 'account-new' }"
        class="flex min-h-11 items-center gap-2 border-t border-border-subtle px-3 text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        @click="open = false"
      >
        <Plus class="size-4" aria-hidden="true" />
        Add account
      </RouterLink>
    </div>
  </div>
</template>
