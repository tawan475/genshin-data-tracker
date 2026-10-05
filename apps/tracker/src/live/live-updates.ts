/**
 * Live updates for the signed-in app: pages change as data arrives (an
 * irminsul upload, an import or delete in another tab or on another device)
 * without a reload.
 *
 * - Each tab keeps one WebSocket to `/api/live`, the user's hub (a Durable
 *   Object; see worker/services/live.ts). It says which account moved to
 *   which data version; the tab then re-reads the account list (a 304 when it
 *   already has it) and the store folds the rows in. Pages load their data
 *   keyed by the version (@/data/account-data), so they refresh by themselves,
 *   keeping filters, pages, scroll and open items.
 * - Pushes sent while a socket is down are lost, so every (re)connect, coming
 *   back online, and being shown again after a while do one catch-up read.
 * - Reconnects back off from 1 s to 30 s. A tab whose socket never manages to
 *   open (a proxy that blocks WebSockets) also reads the list every minute
 *   while visible. A keep-alive ping finds sockets that died silently.
 * - The socket stays open while the tab is hidden: an idle hibernating socket
 *   costs nothing, while closing it would cost a reconnect and a read on every
 *   return. A hidden tab only notes that something changed (and keeps what
 *   other tabs share) and applies it when shown, so background tabs do not
 *   re-download data nobody is looking at.
 * - Tabs share their reads (BroadcastChannel): a read one tab did is applied
 *   by the others, which then skip theirs.
 * - Data never changes under an open dialog: see @/live/holds.
 * - "New capture" (a toast, the time in its tooltip) when the open account
 *   (or on the account list, any account) got a newer newest snapshot;
 *   nothing for seen-again captures, backfills or deletes.
 */

import type { AccountResponse, LiveEvent } from '@gdt/shared'
import { onScopeDispose, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import { formatDateTime } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import { onTabMessage, postToTabs, type TabMessage } from './channel'
import { importingAccounts, onApplyPending, updatesHeld } from './holds'
import {
  BURST_WINDOW_MS,
  FALLBACK_AFTER,
  FALLBACK_POLL_MS,
  FETCH_GAP_MS,
  PING_MS,
  PONG_TIMEOUT_MS,
  captureToShow,
  eventNeedsFetch,
  fetchDelay,
  parseLiveEvent,
  reconnectDelay,
  shouldCatchUp,
} from './policy'

type Timer = ReturnType<typeof setTimeout> | undefined

/** How long a tab waits for another tab's read before reading itself. */
const SHARED_READ_WAIT_MS = 5_000

/** Runs live updates while a user is signed in; call once, from the signed-in layout. */
export function useLiveUpdates(): void {
  const session = useSession()
  const accounts = useAccounts()
  const feedback = useFeedback()
  const route = useRoute()

  let running = false
  let socket: WebSocket | null = null
  let opened = false
  /** Connects in a row that never opened. */
  let failedConnects = 0
  let reconnectTimer: Timer
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let pongTimer: Timer
  let fallback = false
  let fallbackTimer: Timer
  let readTimer: Timer
  let reading: Promise<void> | null = null
  let readAgain = false
  /** When this tab (or another, as it shared) last started a read. */
  let lastReadAt = 0
  let lastSharedEtag: string | null = null
  /** When the oldest event no read has covered yet arrived. */
  let wantedSince: number | null = null
  const eventTimes: number[] = []
  let hiddenAt: number | null = null
  /** An event arrived while hidden. */
  let stale = false
  let stash: { list: AccountResponse[]; etag: string | null } | null = null
  let stashRows: AccountResponse[] = []
  let toastId: number | null = null
  const unsubscribe: (() => void)[] = []

  const userId = () => session.me?.id ?? null
  const visible = () => document.visibilityState === 'visible'

  // --------------------------------------------------------------- applying

  function announce(captures: AccountResponse[]) {
    const param = Number(route.params.accountId)
    const openId = Number.isSafeInteger(param) && param > 0 ? param : null
    const capture = captureToShow(
      captures.filter((a) => !importingAccounts.has(a.id)),
      openId,
    )
    if (!capture?.latest) return
    // One at a time: a newer capture replaces the toast.
    if (toastId !== null) feedback.dismiss(toastId)
    toastId = feedback.toast({
      tone: 'info',
      title: 'New capture',
      hint: `${accounts.displayName(capture)} · ${formatDateTime(capture.latest.takenAt)}`,
    })
  }

  const applyList = (list: AccountResponse[], etag: string | null) =>
    announce(accounts.merge(list, { complete: true, etag }))
  const applyRows = (rows: AccountResponse[]) => announce(accounts.merge(rows))

  // ---------------------------------------------------------- reading the list

  /** Re-reads the account list (a 304 when unchanged) and shares it with the other tabs. */
  function read(): Promise<void> {
    if (reading) {
      readAgain = true
      return reading
    }
    clearTimeout(readTimer)
    readTimer = undefined
    const startedAt = Date.now()
    lastReadAt = startedAt
    wantedSince = null
    const reader = userId()
    if (reader !== null) postToTabs({ type: 'reading', userId: reader, startedAt })
    reading = (async () => {
      try {
        const fresh = await api.accountsSince(accounts.currentEtag())
        if (!running) return
        if (fresh) applyList(fresh.list, fresh.etag)
        const id = userId()
        if (id !== null) {
          postToTabs({
            type: 'list',
            userId: id,
            startedAt,
            etag: accounts.currentEtag(),
            list: fresh?.list ?? null,
          })
        }
      } catch {
        // Offline or a server problem: the next reconnect (or slow poll) reads again.
      } finally {
        reading = null
        if (readAgain && running) {
          readAgain = false
          requestRead()
        }
      }
    })()
    return reading
  }

  /** A read soon: at once after a quiet spell, else after the gap, one for many events. */
  function requestRead() {
    wantedSince ??= Date.now()
    if (reading) {
      readAgain = true
      return
    }
    if (readTimer !== undefined) return
    // A moment of jitter lets one of several visible tabs read for all.
    const delay = fetchDelay(Date.now(), lastReadAt, eventTimes) + Math.random() * 250
    readTimer = setTimeout(() => {
      readTimer = undefined
      void read()
    }, delay)
  }

  function onEvent(event: LiveEvent) {
    const now = Date.now()
    eventTimes.push(now)
    while (eventTimes.length > 0 && now - eventTimes[0]! >= BURST_WINDOW_MS) eventTimes.shift()
    // This tab's own import re-reads its account when the run ends.
    if (event.type === 'data' && importingAccounts.has(event.accountId)) return
    if (!eventNeedsFetch(event, accounts.knownVersion)) return
    if (!visible()) {
      stale = true
      return
    }
    requestRead()
  }

  // ------------------------------------------------------------------ socket

  function liveUrl(): string {
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/live`
  }

  function connect() {
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
    // Offline: the `online` event connects.
    if (!running || socket || !navigator.onLine) return
    let ws: WebSocket
    try {
      ws = new WebSocket(liveUrl())
    } catch {
      failedConnects++
      scheduleReconnect()
      return
    }
    socket = ws
    opened = false
    ws.addEventListener('open', () => {
      if (socket !== ws) return
      opened = true
      failedConnects = 0
      stopFallback()
      startPing(ws)
      // Whatever changed while there was no socket.
      void read()
    })
    ws.addEventListener('message', (event) => {
      if (socket !== ws) return
      if (event.data === 'pong') {
        clearTimeout(pongTimer)
        return
      }
      const parsed = parseLiveEvent(event.data)
      if (parsed) onEvent(parsed)
    })
    ws.addEventListener('close', () => {
      if (socket === ws) dropped()
    })
  }

  /**
   * The socket is gone (closed, refused, or silent): read the list, which also
   * renews an expired session (a refused upgrade, or the hub closing a socket
   * whose token ran out), then reconnect. After repeated refusals only the
   * reconnects go on (the slow poll reads while visible).
   */
  function dropped() {
    const ws = socket
    const wasOpen = opened
    socket = null
    opened = false
    stopPing()
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try {
        ws.close()
      } catch {
        // Already closing.
      }
    }
    if (!running) return
    if (!wasOpen) failedConnects++
    if (failedConnects >= FALLBACK_AFTER) startFallback()
    if (wasOpen || failedConnects <= 1) void read().finally(scheduleReconnect)
    else scheduleReconnect()
  }

  function scheduleReconnect() {
    if (!running || socket || reconnectTimer !== undefined) return
    // A hidden tab that cannot connect waits until it is shown (which connects).
    if (!visible() && failedConnects >= FALLBACK_AFTER) return
    reconnectTimer = setTimeout(
      () => {
        reconnectTimer = undefined
        connect()
      },
      reconnectDelay(Math.max(1, failedConnects)),
    )
  }

  function startPing(ws: WebSocket) {
    stopPing()
    pingTimer = setInterval(() => {
      if (socket !== ws || ws.readyState !== WebSocket.OPEN) return
      try {
        ws.send('ping')
      } catch {
        return
      }
      clearTimeout(pongTimer)
      pongTimer = setTimeout(() => {
        if (socket === ws) dropped()
      }, PONG_TIMEOUT_MS)
    }, PING_MS)
  }

  function stopPing() {
    clearInterval(pingTimer)
    clearTimeout(pongTimer)
    pingTimer = undefined
    pongTimer = undefined
  }

  // -------------------------------------------------------------- slow poll

  function startFallback() {
    if (fallback) return
    fallback = true
    scheduleFallback()
  }

  function scheduleFallback() {
    clearTimeout(fallbackTimer)
    if (!fallback || !running) return
    fallbackTimer = setTimeout(() => {
      if (visible()) void read()
      scheduleFallback()
    }, FALLBACK_POLL_MS)
  }

  function stopFallback() {
    fallback = false
    clearTimeout(fallbackTimer)
  }

  // ------------------------------------------------------------ page events

  function onVisibility() {
    if (!visible()) {
      hiddenAt ??= Date.now()
      return
    }
    const hiddenMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    if (stash) {
      const { list, etag } = stash
      stash = null
      applyList(list, etag)
    }
    if (stashRows.length > 0) {
      const rows = stashRows
      stashRows = []
      applyRows(rows)
    }
    const catchUp = shouldCatchUp({ hiddenMs, stale, socketOpen: opened })
    stale = false
    // Don't sit out a long backoff now that someone is looking.
    if (!socket) connect()
    // Unless another tab read the same list a moment ago.
    const justRead =
      Date.now() - lastReadAt < FETCH_GAP_MS && lastSharedEtag === accounts.currentEtag()
    if (catchUp && !justRead) void read()
  }

  function onOnline() {
    if (!socket) connect()
    void read()
  }

  function onMessage(message: TabMessage) {
    if (message.userId !== userId()) return
    if (message.type === 'rows') {
      if (visible()) applyRows(message.rows)
      else stashRows.push(...message.rows)
      return
    }
    lastReadAt = Math.max(lastReadAt, message.startedAt)
    // That read began after the events this tab wanted one for, so it covers them.
    const covers =
      readTimer !== undefined && wantedSince !== null && message.startedAt >= wantedSince
    if (message.type === 'reading') {
      // Wait for its answer; read anyway if none comes.
      if (covers) {
        clearTimeout(readTimer)
        readTimer = setTimeout(() => {
          readTimer = undefined
          void read()
        }, SHARED_READ_WAIT_MS)
      }
      return
    }
    lastSharedEtag = message.etag
    if (covers) {
      clearTimeout(readTimer)
      readTimer = undefined
      wantedSince = null
    }
    if (message.list) {
      if (visible()) applyList(message.list, message.etag)
      else stash = { list: message.list, etag: message.etag }
    }
    if (fallback) scheduleFallback()
  }

  // -------------------------------------------------------------- lifecycle

  function start() {
    if (running) return
    running = true
    hiddenAt = visible() ? null : Date.now()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    unsubscribe.push(
      onTabMessage(onMessage),
      // A dialog's "Refresh": apply what waits, dialogs or not.
      onApplyPending(() => announce(accounts.applyPending(true))),
    )
    connect()
  }

  function stop() {
    if (!running) return
    running = false
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    while (unsubscribe.length > 0) unsubscribe.pop()!()
    clearTimeout(reconnectTimer)
    clearTimeout(readTimer)
    reconnectTimer = readTimer = undefined
    stopPing()
    stopFallback()
    const ws = socket
    socket = null
    opened = false
    try {
      ws?.close(1000, 'signed out')
    } catch {
      // Already closing.
    }
    failedConnects = 0
    stale = false
    stash = null
    stashRows = []
    wantedSince = null
  }

  watch(
    () => session.status === 'signed-in',
    (signedIn) => (signedIn ? start() : stop()),
    { immediate: true },
  )

  // A dialog closed or this tab's import ended: what waited applies now. An
  // import's own account is re-read by its queue, which says how it went.
  let importing = new Set(importingAccounts)
  watch(
    () => [updatesHeld.value, importingAccounts.size] as const,
    () => {
      const finished = [...importing].filter((id) => !importingAccounts.has(id))
      importing = new Set(importingAccounts)
      if (!running) return
      announce(accounts.applyPending().filter((a) => !finished.includes(a.id)))
    },
  )

  onScopeDispose(stop)
}
