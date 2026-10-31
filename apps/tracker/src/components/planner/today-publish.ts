/** Publishes the Today digest (today-digest.ts) for Teyvat.me Capture. */

import type { TodayDigest } from '@gdt/shared'
import { api } from '@/api'

/** The last digest each account published from this tab (JSON), so an unchanged plan isn't sent again. */
const published = new Map<number, string>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

/**
 * Publishes `digest` for the account after the plan has stayed the same for
 * a few seconds (goals being edited change it often). Failures are silent:
 * Capture keeps showing the last one.
 */
export function publishToday(accountId: number, digest: TodayDigest): void {
  const text = JSON.stringify(digest)
  if (published.get(accountId) === text) return
  clearTimeout(timers.get(accountId))
  timers.set(
    accountId,
    setTimeout(() => {
      timers.delete(accountId)
      api.publishToday(accountId, digest).then(
        () => published.set(accountId, text),
        () => undefined,
      )
    }, 5_000),
  )
}
