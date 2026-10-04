<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutGrid, Menu, Moon, MoreHorizontal, Settings, Sun, Upload, X } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { resolvedTheme } from '@/lib/theme'
import { lastAccountId, useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import AccountSwitcher from './AccountSwitcher.vue'
import { ACCOUNT_SECTIONS } from './nav'
import SectionLabel from './SectionLabel.vue'

/**
 * The signed-in frame, in the original dashboard layout: a sidebar with
 * section labels, a top bar with the page title and account, and (on
 * mobile) a drawer plus a bottom tab bar.
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
const current = computed(() => (currentId.value ? accounts.byId.get(currentId.value) : undefined))

const sections = computed(() =>
  currentId.value
    ? ACCOUNT_SECTIONS.map((s) => ({
        ...s,
        to: { name: s.name, params: { accountId: currentId.value } },
      }))
    : [],
)
const primary = computed(() => sections.value.filter((s) => s.primary))
const title = computed(() => route.meta.title ?? '')

// Flips what is painted; from "system" it pins the opposite theme.
const theme = resolvedTheme
async function toggleTheme() {
  try {
    await session.updateSettings({ theme: theme.value === 'dark' ? 'light' : 'dark' })
  } catch (error) {
    feedback.error('Theme not saved', error)
  }
}

async function signOut() {
  await session.logout()
  accounts.clear()
  await router.push({ name: 'login' })
}

const isActive = (name: string) => route.name === name
const navClass = (active: boolean) =>
  active
    ? 'bg-surface-overlay text-text-primary'
    : 'text-text-secondary hover:bg-surface-overlay/60 hover:text-text-primary'
</script>

<template>
  <div class="flex min-h-dvh">
    <div
      v-if="drawer"
      class="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
      aria-hidden="true"
      @click="drawer = false"
    />
    <!-- Sidebar on desktop; the same markup slides in as a drawer on mobile. -->
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border-default bg-surface-nav transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0"
      :class="drawer ? 'translate-x-0' : '-translate-x-full'"
    >
      <div
        class="flex h-16 shrink-0 items-center justify-between border-b border-border-default px-6"
      >
        <RouterLink
          :to="{ name: 'home' }"
          class="flex items-center gap-2 text-xl font-bold tracking-tight"
        >
          <span class="text-paimon drop-shadow-[0_0_8px_var(--paimon-glow)]" aria-hidden="true"
            >✦</span
          >
          GDT
        </RouterLink>
        <UiIconButton label="Close menu" class="-mr-2 lg:hidden" @click="drawer = false">
          <X class="size-5" aria-hidden="true" />
        </UiIconButton>
      </div>

      <div class="flex flex-1 flex-col gap-7 overflow-y-auto px-4 py-6">
        <div>
          <SectionLabel label="Account" />
          <AccountSwitcher :current-id="currentId" />
          <nav v-if="sections.length" class="mt-3 space-y-0.5" aria-label="Account">
            <RouterLink
              v-for="section in sections"
              :key="section.name"
              :to="section.to"
              class="flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors"
              :class="navClass(isActive(section.name))"
              :aria-current="isActive(section.name) ? 'page' : undefined"
            >
              <component :is="section.icon" class="size-5" aria-hidden="true" />
              {{ section.label }}
            </RouterLink>
          </nav>
        </div>

        <div class="mt-auto">
          <SectionLabel label="System" />
          <nav class="space-y-0.5">
            <RouterLink
              :to="{ name: 'home' }"
              class="flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium"
              :class="navClass(isActive('home'))"
            >
              <LayoutGrid class="size-5" aria-hidden="true" />
              Accounts
            </RouterLink>
            <div class="flex items-center gap-1">
              <RouterLink
                :to="{ name: 'settings' }"
                class="flex flex-1 items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium"
                :class="navClass(isActive('settings'))"
              >
                <Settings class="size-5" aria-hidden="true" />
                Settings
              </RouterLink>
              <UiIconButton
                :label="theme === 'dark' ? 'Light theme' : 'Dark theme'"
                @click="toggleTheme"
              >
                <Moon v-if="theme === 'dark'" class="size-5" aria-hidden="true" />
                <Sun v-else class="size-5" aria-hidden="true" />
              </UiIconButton>
            </div>
          </nav>
        </div>
      </div>

      <div class="border-t border-border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="mb-3 flex items-center gap-3 px-1">
          <span
            class="flex size-8 items-center justify-center rounded-full bg-surface-overlay text-sm font-bold text-text-secondary"
          >
            {{ session.me?.username.charAt(0).toUpperCase() }}
          </span>
          <span class="min-w-0 truncate text-sm font-semibold">{{ session.me?.username }}</span>
        </div>
        <button
          type="button"
          class="w-full rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border-default bg-surface-nav/90 px-4 shadow-sm backdrop-blur sm:px-8"
      >
        <UiIconButton label="Open menu" class="-ml-2 lg:hidden" @click="drawer = true">
          <Menu class="size-5" aria-hidden="true" />
        </UiIconButton>
        <span class="truncate text-lg font-semibold">{{ title }}</span>
        <template v-if="current">
          <div class="hidden h-4 w-px bg-border-strong sm:block" />
          <span
            class="hidden min-w-0 items-center gap-2 text-sm font-medium text-text-muted sm:flex"
          >
            <span class="size-2 shrink-0 rounded-full bg-emerald-500" />
            <span class="truncate">{{ accounts.displayName(current) }}</span>
          </span>
        </template>
        <RouterLink
          v-if="currentId"
          :to="{ name: 'account-import', params: { accountId: currentId } }"
          class="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-ink shadow-sm shadow-accent/30 hover:bg-accent-hover"
        >
          <Upload class="size-4" aria-hidden="true" />
          <span class="hidden sm:inline">Import</span>
        </RouterLink>
      </header>

      <main class="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 lg:py-8">
          <slot />
        </div>
      </main>
    </div>

    <nav
      v-if="primary.length"
      class="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-default bg-surface-nav/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Account"
    >
      <RouterLink
        v-for="section in primary"
        :key="section.name"
        :to="section.to"
        class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.6875rem] font-medium"
        :class="isActive(section.name) ? 'text-accent-text' : 'text-text-muted'"
        :aria-current="isActive(section.name) ? 'page' : undefined"
      >
        <component :is="section.icon" class="size-5 shrink-0" aria-hidden="true" />
        <span class="max-w-full truncate">{{ section.label }}</span>
      </RouterLink>
      <button
        type="button"
        class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.6875rem] font-medium text-text-muted"
        @click="drawer = true"
      >
        <MoreHorizontal class="size-5 shrink-0" aria-hidden="true" />
        <span class="max-w-full truncate">More</span>
      </button>
    </nav>
  </div>
</template>
