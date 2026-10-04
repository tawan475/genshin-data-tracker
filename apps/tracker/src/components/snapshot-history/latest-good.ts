/**
 * The newest snapshot's GOOD text for the export buttons, fetched as the page
 * opens. Browsers only allow a clipboard write and a new tab right after a
 * click, so the click must find the text ready and do both without awaiting.
 * It is the same file the row's "DL" saves (the server response is cached as
 * immutable, so a revisit costs no request).
 */

import { shallowRef, watch, type Ref } from 'vue'
import type { AccountResponse } from '@gdt/shared'
import { api } from '@/api'

interface Entry {
  key: string
  text: Promise<string>
}

/** One account's newest file at a time: it can be a few megabytes. */
let entry: Entry | null = null

function load(accountId: number, snapshotId: number): Promise<string> {
  const key = `${accountId}:${snapshotId}`
  if (entry?.key !== key) {
    const current: Entry = {
      key,
      text: api.snapshotGood(accountId, snapshotId).then((good) => JSON.stringify(good)),
    }
    current.text.catch(() => {
      if (entry === current) entry = null
    })
    entry = current
  }
  return entry.text
}

/** Tracks the account's newest snapshot; `text` is null until it has loaded. */
export function useLatestGood(account: Ref<AccountResponse>) {
  const text = shallowRef<string | null>(null)
  const failed = shallowRef(false)
  let wanted = ''

  function fetchLatest(): Promise<string> {
    const latest = account.value.latest
    if (!latest) return Promise.reject(new Error('No snapshots yet'))
    const key = `${account.value.id}:${latest.id}`
    wanted = key
    failed.value = false
    const promise = load(account.value.id, latest.id)
    promise.then(
      (value) => {
        if (wanted === key) text.value = value
      },
      () => {
        if (wanted === key) failed.value = true
      },
    )
    return promise
  }

  watch(
    () => [account.value.id, account.value.latest?.id],
    () => {
      text.value = null
      wanted = ''
      if (account.value.latest) fetchLatest().catch(() => undefined)
    },
    { immediate: true },
  )

  return { text, failed, fetchLatest }
}

/**
 * Copies without awaiting, so a new tab can open in the same click. The async
 * Clipboard API would lose the race: the tab takes focus before it writes.
 */
export function copyNow(text: string): boolean {
  const active = document.activeElement
  const area = document.createElement('textarea')
  area.value = text
  area.readOnly = true
  area.setAttribute('aria-hidden', 'true')
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
  document.body.append(area)
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  if (active instanceof HTMLElement) active.focus({ preventScroll: true })
  return copied
}

/** Opens `url` in a new tab without giving it this page. False when blocked. */
export function openTab(url: string): boolean {
  const tab = window.open(url, '_blank')
  if (!tab) return false
  tab.opener = null
  return true
}
