import type { AccountResponse } from '@gdt/shared'
import { inject, provide, type ComputedRef, type InjectionKey } from 'vue'

const ACCOUNT: InjectionKey<ComputedRef<AccountResponse>> = Symbol('account')
const MODE: InjectionKey<AccountMode> = Symbol('account-mode')

/**
 * How the account's pages are shown. The owner's (AccountLayout) can change
 * things; staff Inspect (StaffInspectLayout) is read-only: nothing is saved,
 * account settings (favourites, tracked charts, the Planner) are not read,
 * and links to the owner's own pages are hidden.
 */
export interface AccountMode {
  readOnly: boolean
  /** Staff with `data.delete`: purges snapshots (Inspect's Snapshots page). */
  purge?: (ids: number[]) => Promise<number>
  /** Re-reads the account after a purge. */
  reload?: () => Promise<AccountResponse | undefined>
  /** The route a link to an account page (`account-weapons`…) goes to here. */
  route?: (name: string) => string
}

const OWNER: AccountMode = { readOnly: false }

/** Provided by AccountLayout (and Inspect) for every account section. */
export function provideAccount(
  account: ComputedRef<AccountResponse>,
  mode: AccountMode = OWNER,
): void {
  provide(ACCOUNT, account)
  provide(MODE, mode)
}

export function useAccountMode(): AccountMode {
  return inject(MODE, OWNER)
}

/** True on staff Inspect pages: show, never save. */
export function useReadOnly(): boolean {
  return useAccountMode().readOnly
}

/** Maps an account page's route name to where it opens here (Inspect has its own). */
export function useAccountRoute(): (name: string) => string {
  const mode = useAccountMode()
  return (name) => mode.route?.(name) ?? name
}

/**
 * The account the current route is about. Reactive: after an import the
 * accounts store reloads it and `dataVersion` moves, which is what data
 * loaders (see @/data/account-data) key their caches on.
 */
export function useAccount(): ComputedRef<AccountResponse> {
  const account = inject(ACCOUNT)
  if (!account) throw new Error('useAccount() outside an account route')
  return account
}
