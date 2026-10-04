<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Menu, Moon, MoreHorizontal, Sun, X } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import { resolvedTheme } from '@/lib/theme'
import { lastAccountId, useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import { ACCOUNT_SECTIONS, USER_SECTIONS } from './nav'

/**
 * The signed-in frame, as the original dashboard: a sidebar with User,
 * Account and System sections, a top bar with the page title, the account
 * and "Import Data". On mobile the sidebar becomes a drawer and the main
 * account sections get a bottom tab bar.
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

/** Keeps the same section when switching accounts. */
function selectAccount(event: Event) {
  const id = Number((event.target as HTMLSelectElement).value)
  const name =
    typeof route.name === 'string' && route.name.startsWith('account-')
      ? route.name
      : 'account-overview'
  void router.push({ name, params: { accountId: id } })
}

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
    ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
</script>

<template>
  <div class="flex min-h-dvh bg-slate-50 dark:bg-slate-900">
    <div
      v-if="drawer"
      class="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
      aria-hidden="true"
      @click="drawer = false"
    />
    <!-- Sidebar on desktop; the same markup slides in as a drawer on mobile. -->
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 dark:border-slate-700 dark:bg-slate-800"
      :class="drawer ? 'translate-x-0' : '-translate-x-full'"
    >
      <div
        class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-700"
      >
        <RouterLink
          :to="{ name: 'home' }"
          class="text-xl font-bold tracking-tight text-slate-900 dark:text-white"
        >
          GDT
        </RouterLink>
        <button
          type="button"
          class="inline-flex size-9 items-center justify-center rounded-md text-slate-500 lg:hidden"
          aria-label="Close menu"
          @click="drawer = false"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>

      <div class="flex flex-1 flex-col overflow-y-auto py-6">
        <!-- USER SECTION -->
        <div class="mb-8 px-4">
          <div class="mb-3 flex items-center gap-3">
            <h3
              class="text-[0.65rem] font-bold tracking-[0.15em] text-slate-400 uppercase dark:text-slate-500"
            >
              User
            </h3>
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
          </div>
          <nav class="space-y-1">
            <RouterLink
              v-for="item in USER_SECTIONS"
              :key="item.name"
              :to="{ name: item.name }"
              class="flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors"
              :class="navClass(isActive(item.name))"
            >
              {{ item.label }}
            </RouterLink>
          </nav>
        </div>

        <!-- ACCOUNT SECTION -->
        <div class="px-4">
          <div class="mb-4 flex items-center gap-3">
            <h3
              class="text-[0.65rem] font-bold tracking-[0.15em] text-slate-400 uppercase dark:text-slate-500"
            >
              Account
            </h3>
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
          </div>

          <div class="mb-4 px-3">
            <select
              v-if="accounts.list.length > 0"
              :value="currentId ?? ''"
              class="block w-full rounded-md border border-slate-200 bg-slate-100 p-2 text-sm text-slate-800 transition-colors outline-none focus:border-slate-900 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-500"
              aria-label="Account"
              @change="selectAccount"
            >
              <option disabled value="">Select Account</option>
              <option v-for="acc in accounts.list" :key="acc.id" :value="acc.id">
                {{ accounts.displayName(acc) }}
              </option>
            </select>
            <div v-else class="text-xs text-slate-400 italic dark:text-slate-500">
              No accounts found
            </div>
          </div>

          <nav class="space-y-1" aria-label="Account">
            <template v-if="sections.length">
              <RouterLink
                v-for="item in sections"
                :key="item.name"
                :to="item.to"
                class="flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors"
                :class="navClass(isActive(item.name))"
                :aria-current="isActive(item.name) ? 'page' : undefined"
              >
                {{ item.label }}
              </RouterLink>
            </template>
            <template v-else>
              <div
                v-for="item in ACCOUNT_SECTIONS"
                :key="item.name"
                class="flex cursor-not-allowed items-center rounded-md px-3 py-2 text-sm font-medium text-slate-400 opacity-60 dark:text-slate-500"
                title="Select an account first"
              >
                {{ item.label }}
              </div>
            </template>
          </nav>
        </div>

        <!-- SETTINGS SECTION (Bottom) -->
        <div class="mt-auto px-4 pt-8">
          <div class="mb-3 flex items-center gap-3">
            <h3
              class="text-[0.65rem] font-bold tracking-[0.15em] text-slate-400 uppercase dark:text-slate-500"
            >
              System
            </h3>
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
          </div>
          <div
            class="flex items-center overflow-hidden rounded-md border border-slate-200 shadow-sm transition-colors dark:border-slate-700"
          >
            <RouterLink
              :to="{ name: 'settings' }"
              class="flex w-[80%] items-center px-3 py-2 text-sm font-medium transition-colors"
              :class="
                isActive('settings')
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/50'
              "
            >
              Settings
            </RouterLink>
            <BaseButton
              variant="ghost"
              class="h-full w-[20%] !rounded-none !border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              title="Toggle Theme"
              aria-label="Toggle Theme"
              @click="toggleTheme"
            >
              <Moon
                v-if="theme === 'dark'"
                class="h-4 w-4 text-slate-600 dark:text-slate-300"
                aria-hidden="true"
              />
              <Sun v-else class="h-4 w-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />
            </BaseButton>
          </div>
        </div>
      </div>

      <div
        class="border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-colors dark:border-slate-700 dark:bg-slate-800"
      >
        <div class="mb-4 flex items-center gap-3 px-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 transition-colors dark:bg-slate-700 dark:text-slate-300"
          >
            {{ session.me?.username.charAt(0).toUpperCase() }}
          </div>
          <span class="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {{ session.me?.username }}
          </span>
        </div>
        <BaseButton variant="outline" block @click="signOut">Sign Out</BaseButton>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 shadow-sm transition-colors sm:px-8 dark:border-slate-700 dark:bg-slate-800"
      >
        <div class="flex min-w-0 items-center gap-4">
          <button
            type="button"
            class="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-slate-500 lg:hidden"
            aria-label="Open menu"
            @click="drawer = true"
          >
            <Menu class="size-5" aria-hidden="true" />
          </button>
          <h1 class="truncate text-lg font-semibold text-slate-900 dark:text-white">
            {{ title }}
          </h1>
          <template v-if="current">
            <div class="hidden h-4 w-px bg-slate-300 sm:block dark:bg-slate-600"></div>
            <div
              class="hidden min-w-0 items-center gap-2 text-sm font-medium text-slate-500 sm:flex dark:text-slate-400"
            >
              <span class="h-2 w-2 shrink-0 rounded-full bg-green-500 dark:bg-green-400"></span>
              <span class="truncate">{{ accounts.displayName(current) }}</span>
            </div>
          </template>
        </div>

        <BaseButton
          v-if="currentId"
          variant="primary"
          @click="router.push({ name: 'account-import', params: { accountId: currentId } })"
        >
          Import Data
        </BaseButton>
      </header>

      <main class="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div class="mx-auto w-full max-w-7xl p-4 sm:p-8">
          <slot />
        </div>
      </main>
    </div>

    <nav
      v-if="primary.length"
      class="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-800/95"
      aria-label="Account"
    >
      <RouterLink
        v-for="section in primary"
        :key="section.name"
        :to="section.to"
        class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium"
        :class="isActive(section.name) ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'"
        :aria-current="isActive(section.name) ? 'page' : undefined"
      >
        <component :is="section.icon" class="size-5 shrink-0" aria-hidden="true" />
        <span class="max-w-full truncate">{{ section.short ?? section.label }}</span>
      </RouterLink>
      <button
        type="button"
        class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-slate-500"
        @click="drawer = true"
      >
        <MoreHorizontal class="size-5 shrink-0" aria-hidden="true" />
        <span class="max-w-full truncate">More</span>
      </button>
    </nav>
  </div>
</template>
