<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import { Check, ChevronsUpDown, Mail, Plus, UserRound } from 'lucide-vue-next'
import UiModal from '@/components/ui/UiModal.vue'
import { t } from '@/i18n'
import { useAccounts } from '@/stores/accounts'

/**
 * The current account and the way to switch. In the full sidebar the list
 * drops down under the button; `collapsed` (icon-only sidebar) leaves just
 * the account's initial, and the button opens the same list in a dialog.
 */
const props = defineProps<{ currentId: number | null; collapsed?: boolean }>()
const accounts = useAccounts()
const route = useRoute()
const open = ref(false)
const dialog = ref(false)
const root = ref<HTMLElement>()
onClickOutside(root, () => (open.value = false))

watch(
  () => props.collapsed,
  () => {
    open.value = false
    dialog.value = false
  },
)

const current = computed(() => (props.currentId ? accounts.byId.get(props.currentId) : undefined))
const currentName = computed(() =>
  current.value ? accounts.displayName(current.value) : t('shell.switcher.select'),
)

/** The user's own accounts, then those shared with them (account sharing), each under a heading. */
const groups = computed(() => {
  const own = accounts.list.filter((a) => (a.access ?? 'owner') === 'owner')
  const shared = accounts.list.filter((a) => (a.access ?? 'owner') !== 'owner')
  return [
    { key: 'own', label: null, list: own },
    ...(shared.length ? [{ key: 'shared', label: t('sharing.sharedWithMe'), list: shared }] : []),
  ]
})
const invited = computed(() => accounts.invitations.length)

/** "Shared by player01 · Viewer", the tooltip of a shared account. */
function sharedTitle(account: AccountResponse): string | undefined {
  if (!account.owner) return account.uid ?? undefined
  return t('sharing.sharedBy', {
    owner: account.owner,
    role: t(`sharing.role.${account.access ?? 'viewer'}`),
  })
}

/** First letter of the name; else the UID's first digit. */
function initial(account: AccountResponse): string {
  const name = account.name?.trim()
  if (name) return (Array.from(name)[0] ?? '#').toUpperCase()
  return account.uid?.charAt(0) || '#'
}

/** Keep the same section when switching accounts. */
function targetFor(id: number) {
  const name =
    typeof route.name === 'string' && route.name.startsWith('account-')
      ? route.name
      : 'account-overview'
  return { name, params: { accountId: id } }
}

function onButton() {
  if (props.collapsed) dialog.value = true
  else open.value = !open.value
}
</script>

<template>
  <div ref="root" class="relative">
    <!-- One button for both widths: collapsing clips it down to the initial. -->
    <button
      type="button"
      class="relative flex min-h-10 w-full items-center gap-2 overflow-hidden rounded-md border border-border-default bg-surface-overlay px-3 text-left text-sm shadow-sm hover:border-border-strong"
      :aria-expanded="collapsed ? dialog : open"
      :aria-haspopup="collapsed ? 'dialog' : 'listbox'"
      :title="collapsed ? currentName : undefined"
      @click="onButton"
    >
      <span
        class="flex size-5 shrink-0 items-center justify-center rounded bg-accent/15 text-xs font-bold text-accent-text"
        aria-hidden="true"
      >
        <template v-if="current">{{ initial(current) }}</template>
        <UserRound v-else class="size-3.5" />
      </span>
      <span
        v-if="invited"
        class="absolute top-1.5 left-6 size-2 rounded-full bg-accent ring-2 ring-surface-nav"
        :title="$t('sharing.invitationsCount', { n: invited }, invited)"
      />
      <span
        class="nav-fade min-w-0 flex-1 truncate font-medium"
        :class="collapsed ? 'opacity-0' : ''"
      >
        {{ currentName }}
      </span>
      <ChevronsUpDown
        class="nav-fade size-4 shrink-0 text-text-muted"
        :class="collapsed ? 'opacity-0' : ''"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="open"
      class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border-default bg-surface-raised py-1 shadow-overlay"
      role="listbox"
    >
      <template v-for="group in groups" :key="group.key">
        <p
          v-if="group.label"
          class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-text-muted uppercase"
          :class="group.key === groups[0]?.key ? '' : 'mt-1 border-t border-border-default'"
        >
          {{ group.label }}
        </p>
        <RouterLink
          v-for="account in group.list"
          :key="account.id"
          :to="targetFor(account.id)"
          role="option"
          :aria-selected="account.id === currentId"
          class="flex min-h-9 items-center gap-2 px-3 text-sm hover:bg-surface-overlay"
          :title="sharedTitle(account)"
          @click="open = false"
        >
          <span class="min-w-0 flex-1 truncate">{{ accounts.displayName(account) }}</span>
          <span v-if="account.owner" class="max-w-24 shrink-0 truncate text-xs text-text-muted">{{
            account.owner
          }}</span>
          <Check
            v-if="account.id === currentId"
            class="size-4 text-accent-text"
            aria-hidden="true"
          />
        </RouterLink>
      </template>
      <RouterLink
        v-if="invited"
        :to="{ name: 'home' }"
        class="flex min-h-9 items-center gap-2 border-t border-border-default px-3 text-sm text-accent-text hover:bg-surface-overlay"
        @click="open = false"
      >
        <Mail class="size-4" aria-hidden="true" />
        {{ $t('sharing.invitationsCount', { n: invited }, invited) }}
      </RouterLink>
      <RouterLink
        :to="{ name: 'account-new' }"
        class="flex min-h-9 items-center gap-2 border-t border-border-default px-3 text-sm text-text-secondary hover:bg-surface-overlay"
        @click="open = false"
      >
        <Plus class="size-4" aria-hidden="true" />
        {{ $t('shell.switcher.add') }}
      </RouterLink>
    </div>

    <UiModal :open="dialog" :title="$t('shell.accounts')" @close="dialog = false">
      <ul class="-mx-2 space-y-0.5">
        <template v-for="group in groups" :key="group.key">
          <li
            v-if="group.label"
            class="mt-2 px-2 pt-1 text-xs font-semibold tracking-wide text-text-muted uppercase"
          >
            {{ group.label }}
          </li>
          <li v-for="account in group.list" :key="account.id">
            <RouterLink
              :to="targetFor(account.id)"
              class="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface-overlay"
              :class="account.id === currentId ? 'bg-surface-overlay' : ''"
              :aria-current="account.id === currentId ? 'true' : undefined"
              :autofocus="account.id === currentId || undefined"
              @click="dialog = false"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-sm font-bold text-accent-text"
                aria-hidden="true"
              >
                {{ initial(account) }}
              </span>
              <span class="min-w-0 flex-1 truncate font-medium">
                {{ accounts.displayName(account) }}
              </span>
              <span
                v-if="account.owner"
                class="max-w-28 shrink-0 truncate text-xs text-text-muted"
                :title="sharedTitle(account)"
              >
                {{ account.owner }}
              </span>
              <span
                v-else-if="account.name && account.uid"
                class="shrink-0 font-mono text-xs text-text-muted"
                :title="$t('common.uid')"
              >
                {{ account.uid }}
              </span>
              <Check
                v-if="account.id === currentId"
                class="size-4 shrink-0 text-accent-text"
                aria-hidden="true"
              />
            </RouterLink>
          </li>
        </template>
        <li v-if="invited">
          <RouterLink
            :to="{ name: 'home' }"
            class="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-accent-text hover:bg-surface-overlay"
            @click="dialog = false"
          >
            <span class="flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
              <Mail class="size-4" />
            </span>
            {{ $t('sharing.invitationsCount', { n: invited }, invited) }}
          </RouterLink>
        </li>
        <li class="mt-1 border-t border-border-default pt-1">
          <RouterLink
            :to="{ name: 'account-new' }"
            class="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            @click="dialog = false"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong"
              aria-hidden="true"
            >
              <Plus class="size-4" />
            </span>
            {{ $t('shell.switcher.add') }}
          </RouterLink>
        </li>
      </ul>
    </UiModal>
  </div>
</template>
