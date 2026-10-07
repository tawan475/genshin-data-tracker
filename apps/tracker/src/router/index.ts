import { createRouter, createWebHistory } from 'vue-router'
import { setPublicPage } from '@/lib/theme'
import { useAccounts } from '@/stores/accounts'
import { useSession } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in user; the app shell wraps it. */
    auth?: boolean
    /** Only for signed-out visitors (login, register). */
    guest?: boolean
    /** A public page (PublicFrame): the whole document is dark while it shows. */
    public?: boolean
    title?: string
  }
}

const account = (path: string, name: string, title: string, load: () => Promise<unknown>) => ({
  path,
  name,
  component: load,
  meta: { auth: true, title },
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView.vue'),
      meta: { public: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true, public: true, title: 'Sign in' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true, public: true, title: 'Create account' },
    },
    // Account recovery: open signed in or not (links arrive by email).
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { public: true, title: 'Reset password' },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { public: true, title: 'New password' },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/VerifyEmailView.vue'),
      meta: { public: true, title: 'Confirm email' },
    },
    {
      path: '/app',
      component: () => import('@/views/app/AppLayout.vue'),
      meta: { auth: true },
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/app/HomeView.vue'),
          meta: { auth: true, title: 'Accounts' },
        },
        // Pages that existed briefly; old links land on their replacements.
        { path: 'accounts', redirect: { name: 'home' } },
        {
          path: 'accounts/new',
          name: 'account-new',
          component: () => import('@/views/app/NewAccountView.vue'),
          meta: { auth: true, title: 'Add account' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/app/SettingsView.vue'),
          meta: { auth: true, title: 'Settings' },
        },
        {
          path: 'a/:accountId(\\d+)',
          component: () => import('@/views/account/AccountLayout.vue'),
          meta: { auth: true },
          children: [
            account(
              '',
              'account-overview',
              'Overview',
              () => import('@/views/account/OverviewView.vue'),
            ),
            account(
              'progression',
              'account-progression',
              'Progression',
              () => import('@/views/account/ProgressionView.vue'),
            ),
            account(
              'characters',
              'account-characters',
              'Characters',
              () => import('@/views/account/CharactersView.vue'),
            ),
            account(
              'weapons',
              'account-weapons',
              'Weapons',
              () => import('@/views/account/WeaponsView.vue'),
            ),
            account(
              'artifacts',
              'account-artifacts',
              'Artifacts',
              () => import('@/views/account/ArtifactsView.vue'),
            ),
            account(
              'materials',
              'account-materials',
              'Materials',
              () => import('@/views/account/MaterialsView.vue'),
            ),
            account(
              'planner',
              'account-planner',
              'Planner',
              () => import('@/views/account/PlannerView.vue'),
            ),
            account(
              'achievements',
              'account-achievements',
              'Achievements',
              () => import('@/views/account/AchievementsView.vue'),
            ),
            account(
              'snapshots',
              'account-snapshots',
              'Snapshots',
              () => import('@/views/account/SnapshotsView.vue'),
            ),
            { path: 'export', redirect: { name: 'account-snapshots' } },
            account(
              'import',
              'account-import',
              'Import',
              () => import('@/views/account/ImportView.vue'),
            ),
            account(
              'settings',
              'account-settings',
              'Account settings',
              () => import('@/views/account/AccountSettingsView.vue'),
            ),
          ],
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Not found' },
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSession()
  if (to.meta.auth || to.meta.guest || to.name === 'landing') await session.ensureLoaded()

  if (to.meta.auth && session.status !== 'signed-in') {
    return { name: 'login', query: to.fullPath !== '/app' ? { next: to.fullPath } : {} }
  }
  if (to.meta.guest && session.status === 'signed-in') return { name: 'home' }
  if (to.meta.auth) await useAccounts().ensureLoaded()
})

router.afterEach((to) => {
  setPublicPage(to.meta.public === true)
  document.title = to.meta.title ? `${to.meta.title} · GI Tracker` : 'GI Tracker'
})

/** After a deploy, an open tab may ask for a chunk that no longer exists: reload once. */
router.onError((error, to) => {
  const message = String((error as Error)?.message ?? error)
  if (
    !/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
  )
    return
  try {
    const last = Number(sessionStorage.getItem('gdt:chunk-reload') ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem('gdt:chunk-reload', String(Date.now()))
  } catch {
    // Without sessionStorage we cannot rate-limit; reload anyway.
  }
  window.location.assign(to.fullPath)
})

export default router
