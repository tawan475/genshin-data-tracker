import { readonly, ref } from 'vue'

/**
 * Whether the desktop sidebar shows icons only: a per-device choice, kept in
 * localStorage as `gdt:nav-collapsed` ("1" when collapsed, absent when
 * expanded). The phone drawer ignores it.
 */
export const NAV_COLLAPSED_KEY = 'nav-collapsed'

/** Where the flag lives; AppShell passes lib/storage (which never throws). */
export interface FlagStore {
  read(): string | null
  write(value: string | null): void
}

/** Read once when the shell mounts, so the first paint already has the right width. */
export function useNavCollapse(store: FlagStore) {
  const collapsed = ref(store.read() === '1')

  function set(value: boolean): void {
    collapsed.value = value
    store.write(value ? '1' : null)
  }

  return {
    collapsed: readonly(collapsed),
    set,
    toggle: () => set(!collapsed.value),
  }
}
