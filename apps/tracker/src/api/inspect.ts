import { ApiRequestError } from './http'

/**
 * Accounts open in staff Inspect (StaffInspectLayout). Their pages are the
 * owner's own, so the account calls they make are routed here: a read goes
 * to `/api/staff/accounts/:id/…` (logged there), a write is refused before
 * it is sent (Inspect never saves).
 */
const inspected = new Set<number>()

export function startInspect(id: number): void {
  inspected.add(id)
}

export function endInspect(id: number): void {
  inspected.delete(id)
}

/** `/api/accounts/:id/<rest>`, or its staff twin while the account is inspected. */
export function accountRead(id: number, rest: string): string {
  return inspected.has(id) ? `/api/staff/accounts/${id}/${rest}` : `/api/accounts/${id}/${rest}`
}

/** `write()`, unless the account is inspected: then a refusal and nothing sent. */
export function accountWrite<T>(id: number, write: () => Promise<T>): Promise<T> {
  return inspected.has(id)
    ? Promise.reject(new ApiRequestError(403, 'inspect_read_only', 'Inspect is read-only'))
    : write()
}
