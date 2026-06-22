import { createRouter, createWebHistory } from 'vue-router'
import PublicLayout from '../layouts/PublicLayout.vue'
import DashboardLayout from '../layouts/DashboardLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: PublicLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../views/HomeView.vue')
        },
        {
          path: 'login',
          name: 'login',
          component: () => import('../views/LoginView.vue')
        },
        {
          path: 'register',
          name: 'register',
          component: () => import('../views/RegisterView.vue')
        }
      ]
    },
    {
      path: '/dashboard',
      component: DashboardLayout,
      children: [
        {
          path: '',
          name: 'dashboard-overview',
          component: () => import('../views/dashboard/OverviewView.vue')
        },
        {
          path: 'accounts',
          name: 'dashboard-accounts',
          component: () => import('../views/dashboard/AccountsView.vue')
        },
        {
          path: 'account-overview',
          name: 'account-overview',
          component: () => import('../views/dashboard/AccountOverviewView.vue')
        },
        {
          path: 'account-detail',
          name: 'account-detail',
          component: () => import('../views/dashboard/AccountDetailView.vue')
        },
        {
          path: 'account-snapshots',
          name: 'account-snapshots',
          component: () => import('../views/dashboard/AccountSnapshotsView.vue')
        },
        {
          path: 'export',
          name: 'export',
          component: () => import('../views/dashboard/ExportView.vue')
        }
      ]
    }
  ]
})

export default router
