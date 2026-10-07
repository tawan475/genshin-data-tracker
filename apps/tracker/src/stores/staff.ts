import type { RoleRef } from '@gdt/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'

/**
 * The signed-in staff member's roles (for the top bar's role dot), read
 * once when a staff page opens. What they may do comes from
 * `session.can(node)`; the Worker checks every request again.
 */
export const useStaff = defineStore('staff', () => {
  const roles = ref<RoleRef[]>([])
  let loading: Promise<void> | null = null

  const topRole = computed(() => roles.value[0] ?? null)

  function ensureLoaded(): Promise<void> {
    loading ??= api.staff
      .me()
      .then((me) => {
        roles.value = me.roles
      })
      .catch(() => {
        loading = null
      })
    return loading
  }

  /** After roles change (the caller's own may have). */
  function reload(): Promise<void> {
    loading = null
    return ensureLoaded()
  }

  function clear() {
    roles.value = []
    loading = null
  }

  return { roles, topRole, ensureLoaded, reload, clear }
})
