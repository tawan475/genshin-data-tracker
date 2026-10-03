<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { Check, ChevronsUpDown, Plus } from 'lucide-vue-next'
import { useAccounts } from '@/stores/accounts'

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
      class="flex min-h-10 w-full items-center gap-2 rounded-md border border-border-default bg-surface-overlay px-3 text-left text-sm shadow-sm hover:border-border-strong"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span class="min-w-0 flex-1 truncate font-medium">
        {{ current ? accounts.displayName(current) : 'Select account' }}
      </span>
      <ChevronsUpDown class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border-default bg-surface-raised py-1 shadow-overlay"
      role="listbox"
    >
      <RouterLink
        v-for="account in accounts.list"
        :key="account.id"
        :to="targetFor(account.id)"
        role="option"
        :aria-selected="account.id === currentId"
        class="flex min-h-9 items-center gap-2 px-3 text-sm hover:bg-surface-overlay"
        :title="account.uid ?? undefined"
        @click="open = false"
      >
        <span class="min-w-0 flex-1 truncate">{{ accounts.displayName(account) }}</span>
        <Check v-if="account.id === currentId" class="size-4 text-accent-text" aria-hidden="true" />
      </RouterLink>
      <RouterLink
        :to="{ name: 'account-new' }"
        class="flex min-h-9 items-center gap-2 border-t border-border-default px-3 text-sm text-text-secondary hover:bg-surface-overlay"
        @click="open = false"
      >
        <Plus class="size-4" aria-hidden="true" />
        Add account
      </RouterLink>
    </div>
  </div>
</template>
