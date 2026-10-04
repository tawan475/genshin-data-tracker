import type { PlannerTarget } from '@gdt/shared'
import { shallowRef, watch, type Ref } from 'vue'
import { api } from '@/api'
import { useFeedback } from '@/stores/feedback'
import { targetId, type TargetInput, type TargetRef } from './model'

type Op = { kind: 'upsert'; input: TargetInput } | { kind: 'remove'; ref: TargetRef }

const DEBOUNCE_MS = 500

function apply(targets: readonly PlannerTarget[], ops: Iterable<Op>): PlannerTarget[] {
  const byId = new Map(targets.map((t) => [targetId(t), t]))
  const now = Date.now()
  for (const op of ops) {
    if (op.kind === 'remove') {
      byId.delete(targetId(op.ref))
      continue
    }
    const input = op.input
    let target: PlannerTarget
    if (input.kind === 'character') {
      target = {
        kind: 'character',
        key: input.key,
        owner: '',
        target: { ...input.target, active: input.target.active ?? true },
        updatedAt: now,
      }
    } else if (input.kind === 'item') {
      target = {
        kind: 'item',
        key: input.key,
        owner: '',
        target: { ...input.target, active: input.target.active ?? true },
        updatedAt: now,
      }
    } else {
      target = {
        kind: 'weapon',
        key: input.key,
        owner: input.owner,
        target: { ...input.target, active: input.target.active ?? true },
        updatedAt: now,
      }
    }
    byId.set(targetId(input), target)
  }
  return [...byId.values()]
}

/**
 * The account's planner targets with optimistic writes. `change` applies at
 * once on screen and sends after a short pause, merged with other quick
 * changes (toggling several goals is one request); `commit` sends at once
 * (dialog saves, imports). Requests go one at a time; a failed one reloads
 * the server's state and says so.
 */
export function usePlannerTargets(accountId: Ref<number>) {
  const feedback = useFeedback()
  const targets = shallowRef<PlannerTarget[] | null>(null)
  const error = shallowRef<unknown>(null)
  const saving = shallowRef(false)
  /** Server state; `targets` is this plus the pending ops. */
  let server: PlannerTarget[] = []
  const pending = new Map<string, Op>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let flight: Promise<void> | null = null
  let generation = 0

  /** The account `server` and `pending` belong to. */
  let loadedId = accountId.value

  /** `keep` leaves the current list on screen while the server's arrives. */
  async function load(keep = false) {
    const mine = ++generation
    pending.clear()
    clearTimeout(timer)
    loadedId = accountId.value
    error.value = null
    if (!keep) targets.value = null
    try {
      const response = await api.plannerTargets(loadedId)
      if (mine !== generation) return
      server = response.targets
      targets.value = server
    } catch (cause) {
      if (mine === generation) error.value = cause
    }
  }

  // Switching accounts: send what is still waiting for the old one, then load.
  watch(
    accountId,
    () => {
      if (pending.size > 0) void send(loadedId, [...pending.values()]).catch(() => {})
      void load()
    },
    { immediate: true },
  )

  function send(id: number, ops: Op[]) {
    return api.updatePlannerTargets(id, {
      upsert: ops.flatMap((op) => (op.kind === 'upsert' ? [op.input] : [])),
      remove: ops.flatMap((op) => (op.kind === 'remove' ? [op.ref] : [])),
    })
  }

  function queue(ops: Op[]) {
    for (const op of ops) {
      const id = op.kind === 'remove' ? targetId(op.ref) : targetId(op.input)
      pending.set(id, op)
    }
    targets.value = apply(server, pending.values())
  }

  async function flush(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    while (flight) await flight.catch(() => {})
    if (pending.size === 0) return
    const ops = [...pending.values()]
    pending.clear()
    const mine = generation
    saving.value = true
    flight = (async () => {
      try {
        const response = await send(loadedId, ops)
        if (mine !== generation) return
        server = response.targets
        targets.value = apply(server, pending.values())
      } catch (cause) {
        if (mine !== generation) return
        feedback.error('Not saved', cause)
        await load(true)
        throw cause
      } finally {
        saving.value = false
        flight = null
      }
    })()
    await flight
  }

  /** Optimistic change, sent after a short pause. */
  function change(ops: Op[]) {
    queue(ops)
    clearTimeout(timer)
    timer = setTimeout(() => void flush().catch(() => {}), DEBOUNCE_MS)
  }

  /** Optimistic change, sent now; rejects when the server refused it. */
  async function commit(ops: Op[]): Promise<void> {
    queue(ops)
    await flush()
  }

  return {
    targets,
    error,
    saving,
    reload: () => load(),
    change,
    commit,
    /** Sends anything still waiting (on leaving the page). */
    flush: () => flush().catch(() => {}),
  }
}

export const upsert = (input: TargetInput): Op => ({ kind: 'upsert', input })
export const remove = (ref: TargetRef): Op => ({ kind: 'remove', ref })
