import { shallowRef } from 'vue'
import type { BootstrapResponse } from '@gdt/shared'
import { api } from '@/api'
import { routeAccountId } from '@/lib/route-account'

/**
 * The app's first request (GET /api/bootstrap): the user, the account list
 * and the opened account's settings in one round trip, instead of `me`, then
 * `accounts`, then each page's settings read. The session store adopts the
 * user from it, the accounts store takes the list (once: later reads go to
 * /api/accounts as before).
 */

let first: Promise<BootstrapResponse> | null = null
let listTaken = false

/** The user's newest signed-in capture app, from the bootstrap (the top bar's Capture button). */
export const captureDevice = shallowRef<BootstrapResponse['capture']>(null)

/** Starts the bootstrap request, once per page load. */
export function bootstrapOnce(): Promise<BootstrapResponse> {
  if (!first) {
    first = api.bootstrap(routeAccountId(window.location.pathname))
    listTaken = false
    first.then(
      (answer) => (captureDevice.value = answer.capture ?? null),
      () => undefined,
    )
  }
  return first
}

/** The bootstrap for the accounts store: the first time only, and only if it ran. */
export function takeBootstrap(): Promise<BootstrapResponse> | null {
  if (!first || listTaken) return null
  listTaken = true
  return first
}

/** Signed out: nothing from this bootstrap is used again. */
export function forgetBootstrap(): void {
  first = null
  listTaken = false
  captureDevice.value = null
}
