<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutGrid, LogOut, Menu, Moon, MoreHorizontal, Settings, Sun, X } from 'lucide-vue-next'
import { lastAccountId, useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import AccountSwitcher from './AccountSwitcher.vue'
import { ACCOUNT_SECTIONS } from './nav'

/**
 * The signed-in frame. Desktop: a sidebar with the account switcher and the
 * account's sections. Mobile: a top bar and a bottom tab bar (primary
 * sections) with everything else in a drawer.
 */
const route = useRoute()
const router = useRouter()
const session = useSession()
const accounts = useAccounts()
const feedback = useFeedback()
const drawer = ref(false)

watch(
  () => route.fullPath,
  () => (drawer.value = false),
)

const currentId = computed<number | null>(() => {
  const param = Number(route.params.accountId)
  if (Number.isSafeInteger(param) && param > 0) return param
  const last = lastAccountId()
  return last && accounts.byId.has(last) ? last : (accounts.list[0]?.id ?? null)
})

const sections = computed(() =>
  currentId.value
    ? ACCOUNT_SECTIONS.map((s) => ({
        ...s,
        to: { name: s.name, params: { accountId: currentId.value } },
      }))
    : [],
)
const primary = computed(() => sections.value.filter((s) => s.primary))

const theme = computed(() => session.settings.theme)
async function toggleTheme() {
  try {
    await session.updateSettings({ theme: theme.value === 'dark' ? 'light' : 'dark' })
  } catch (error) {
    feedback.error('Could not save the theme', error)
  }
}

async function signOut() {
  await session.logout()
  accounts.clear()
  await router.push({ name: 'login' })
}

function isActive(name: string) {
  return route.name === name
}
</script>

<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
    <!-- Desktop sidebar -->
    <aside
      class="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border-subtle bg-surface-nav px-4 py-5 lg:flex"
    >
      <RouterLink
        :to="{ name: 'home' }"
        class="px-2 font-display text-2xl font-bold tracking-tight"
      >
        GI<span class="text-accent-text">/</span>tracker
      </RouterLink>
      <AccountSwitcher :current-id="currentId" />
      <nav v-if="sections.length" class="flex flex-col gap-1" aria-label="Account">
        <RouterLink
          v-for="section in sections"
          :key="section.name"
          :to="section.to"
          class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-base transition-colors"
          :class="
            isActive(section.name)
              ? 'bg-surface-overlay font-medium text-text-primary'
              : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
          "
          :aria-current="isActive(section.name) ? 'page' : undefined"
        >
          <component :is="section.icon" class="size-5" aria-hidden="true" />
          {{ section.label }}
        </RouterLink>
      </nav>
      <div class="mt-auto flex flex-col gap-1 border-t border-border-subtle pt-4">
        <RouterLink
          :to="{ name: 'home' }"
          class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        >
          <LayoutGrid class="size-5" aria-hidden="true" />
          All accounts
        </RouterLink>
        <RouterLink
          :to="{ name: 'settings' }"
          class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        >
          <Settings class="size-5" aria-hidden="true" />
          Settings
        </RouterLink>
        <div class="mt-2 flex items-center gap-2 px-3">
          <span class="min-w-0 flex-1 truncate text-sm text-text-muted">{{
            session.me?.username
          }}</span>
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="toggleTheme"
          >
            <Sun v-if="theme === 'dark'" class="size-5" aria-hidden="true" />
            <Moon v-else class="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            aria-label="Sign out"
            @click="signOut"
          >
            <LogOut class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile top bar -->
    <header
      class="sticky top-0 z-20 flex items-center gap-2 border-b border-border-subtle bg-surface-nav/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden"
    >
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-text-secondary"
        aria-label="Open menu"
        @click="drawer = true"
      >
        <Menu class="size-5" aria-hidden="true" />
      </button>
      <RouterLink :to="{ name: 'home' }" class="font-display text-xl font-bold">
        GI<span class="text-accent-text">/</span>tracker
      </RouterLink>
    </header>

    <main class="min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-8">
        <slot />
      </div>
    </main>

    <!-- Mobile tab bar -->
    <nav
      v-if="primary.length"
      class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-subtle bg-surface-nav/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Account"
    >
      <RouterLink
        v-for="section in primary"
        :key="section.name"
        :to="section.to"
        class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-sm"
        :class="isActive(section.name) ? 'text-accent-text' : 'text-text-muted'"
        :aria-current="isActive(section.name) ? 'page' : undefined"
      >
        <component :is="section.icon" class="size-5" aria-hidden="true" />
        {{ section.label }}
      </RouterLink>
      <button
        type="button"
        class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-sm text-text-muted"
        @click="drawer = true"
      >
        <MoreHorizontal class="size-5" aria-hidden="true" />
        More
      </button>
    </nav>

    <!-- Mobile drawer -->
    <div
      v-if="drawer"
      class="fixed inset-0 z-40 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div class="absolute inset-0 bg-black/60" @click="drawer = false" />
      <div
        class="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col gap-5 overflow-y-auto bg-surface-nav px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-6"
      >
        <div class="flex items-center justify-between">
          <span class="font-display text-xl font-bold"
            >GI<span class="text-accent-text">/</span>tracker</span
          >
          <button
            type="button"
            class="inline-flex size-11 items-center justify-center rounded-md text-text-secondary"
            aria-label="Close menu"
            @click="drawer = false"
          >
            <X class="size-5" aria-hidden="true" />
          </button>
        </div>
        <AccountSwitcher :current-id="currentId" />
        <nav class="flex flex-col gap-1" aria-label="Account sections">
          <RouterLink
            v-for="section in sections"
            :key="section.name"
            :to="section.to"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3"
            :class="
              isActive(section.name) ? 'bg-surface-overlay font-medium' : 'text-text-secondary'
            "
          >
            <component :is="section.icon" class="size-5" aria-hidden="true" />
            {{ section.label }}
          </RouterLink>
        </nav>
        <div class="mt-auto flex flex-col gap-1 border-t border-border-subtle pt-4">
          <RouterLink
            :to="{ name: 'home' }"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-text-secondary"
          >
            <LayoutGrid class="size-5" aria-hidden="true" /> All accounts
          </RouterLink>
          <RouterLink
            :to="{ name: 'settings' }"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-text-secondary"
          >
            <Settings class="size-5" aria-hidden="true" /> Settings
          </RouterLink>
          <button
            type="button"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-text-secondary"
            @click="toggleTheme"
          >
            <Sun v-if="theme === 'dark'" class="size-5" aria-hidden="true" />
            <Moon v-else class="size-5" aria-hidden="true" />
            {{ theme === 'dark' ? 'Light theme' : 'Dark theme' }}
          </button>
          <button
            type="button"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-text-secondary"
            @click="signOut"
          >
            <LogOut class="size-5" aria-hidden="true" /> Sign out
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
