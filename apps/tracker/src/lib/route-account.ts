/** The account a URL opens (`/app/a/:id/...`), or null. */
export function routeAccountId(path: string): number | null {
  const match = /^\/app\/a\/(\d+)(?:\/|$)/.exec(path)
  const id = match ? Number(match[1]) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
