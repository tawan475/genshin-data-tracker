import type { AccountResponse } from '@gdt/shared'
import { inject, provide, type ComputedRef, type InjectionKey } from 'vue'

const ACCOUNT: InjectionKey<ComputedRef<AccountResponse>> = Symbol('account')

/** Provided by AccountLayout for every account section. */
export function provideAccount(account: ComputedRef<AccountResponse>): void {
  provide(ACCOUNT, account)
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
