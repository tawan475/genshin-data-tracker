/**
 * Sends the Planner's alert facts (alert-facts.ts) to the server when they
 * change, only while someone of the account has alerts (the server says so).
 */

import { watch, type Ref } from 'vue'
import { api } from '@/api'

/** Accounts whose users have no alerts (the server said so): this tab stops sending for them. */
const silent = new Set<number>()
const sent = new Map<number, string>()

/** Sends the facts a few seconds after they settle, when they changed. */
export function useAlertFacts(
  accountId: Ref<number>,
  facts: Ref<Record<string, unknown> | null>,
  enabled: Ref<boolean>,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    [accountId, facts, enabled],
    ([id, value, on]) => {
      clearTimeout(timer)
      if (!on || !value || silent.has(id)) return
      const text = JSON.stringify(value)
      if (sent.get(id) === text) return
      timer = setTimeout(() => {
        api.alertFacts(id, value).then(
          (answer) => {
            sent.set(id, text)
            if (!answer.alerts) silent.add(id)
          },
          () => undefined,
        )
      }, 3_000)
    },
    { immediate: true },
  )
}

/** A device turned alerts on here: every account sends its facts again. */
export function alertFactsWanted(): void {
  silent.clear()
  sent.clear()
}
