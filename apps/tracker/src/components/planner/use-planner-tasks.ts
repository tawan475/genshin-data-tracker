import type { PlannerTask, PlannerTaskInput } from '@gdt/shared'
import { shallowRef, watch, type Ref } from 'vue'
import { api } from '@/api'
import { useFeedback } from '@/stores/feedback'

export type TaskRef = Pick<PlannerTaskInput, 'kind' | 'id'>
export type TaskOp = { kind: 'upsert'; input: PlannerTaskInput } | { kind: 'remove'; ref: TaskRef }

const DEBOUNCE_MS = 500

export const taskKey = (t: TaskRef) => `${t.kind}:${t.id}`

/** The tasks as the server will have them after `ops` (a task is written whole). */
export function applyTaskOps(tasks: readonly PlannerTask[], ops: Iterable<TaskOp>): PlannerTask[] {
  const byKey = new Map(tasks.map((t) => [taskKey(t), t]))
  const now = Date.now()
  for (const op of ops) {
    if (op.kind === 'remove') byKey.delete(taskKey(op.ref))
    else byKey.set(taskKey(op.input), { ...op.input, updatedAt: now } as PlannerTask)
  }
  return [...byKey.values()]
}

/**
 * The account's tasks with optimistic writes, like the goals' store: a
 * change shows at once and is sent after a short pause (several ticks are
 * one request); `commit` sends at once. A refused write says so and reloads
 * what the server has.
 */
export function usePlannerTasks(accountId: Ref<number>) {
  const feedback = useFeedback()
  const tasks = shallowRef<PlannerTask[] | null>(null)
  const error = shallowRef<unknown>(null)
  let server: PlannerTask[] = []
  const pending = new Map<string, TaskOp>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let flight: Promise<void> | null = null
  let generation = 0
  let loadedId = accountId.value

  async function load(keep = false) {
    const mine = ++generation
    pending.clear()
    clearTimeout(timer)
    loadedId = accountId.value
    error.value = null
    if (!keep) tasks.value = null
    try {
      const response = await api.plannerTasks(loadedId)
      if (mine !== generation) return
      server = response.tasks
      tasks.value = server
    } catch (cause) {
      if (mine === generation) error.value = cause
    }
  }

  watch(
    accountId,
    () => {
      if (pending.size > 0) void send(loadedId, [...pending.values()]).catch(() => {})
      void load()
    },
    { immediate: true },
  )

  function send(id: number, ops: TaskOp[]) {
    return api.updatePlannerTasks(id, {
      upsert: ops.flatMap((op) => (op.kind === 'upsert' ? [op.input] : [])),
      remove: ops.flatMap((op) => (op.kind === 'remove' ? [op.ref] : [])),
    })
  }

  function queue(ops: TaskOp[]) {
    for (const op of ops) {
      const key = taskKey(op.kind === 'upsert' ? op.input : op.ref)
      pending.delete(key)
      pending.set(key, op)
    }
    tasks.value = applyTaskOps(server, pending.values())
  }

  async function flush(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    while (flight) await flight.catch(() => {})
    if (pending.size === 0) return
    const ops = [...pending.values()]
    pending.clear()
    const mine = generation
    flight = (async () => {
      try {
        const response = await send(loadedId, ops)
        if (mine !== generation) return
        server = response.tasks
        tasks.value = applyTaskOps(server, pending.values())
      } catch (cause) {
        if (mine !== generation) return
        feedback.error('Not saved', cause)
        await load(true)
        throw cause
      } finally {
        flight = null
      }
    })()
    await flight
  }

  return {
    tasks,
    error,
    reload: () => load(),
    /** Shows now, sends after a short pause. */
    change(ops: TaskOp[]) {
      queue(ops)
      clearTimeout(timer)
      timer = setTimeout(() => void flush().catch(() => {}), DEBOUNCE_MS)
    },
    /** Shows now, sends now; rejects when the server refused it. */
    async commit(ops: TaskOp[]): Promise<void> {
      queue(ops)
      await flush()
    },
    /** Sends what waits, then re-reads (a change made in another tab or device). */
    async refresh() {
      await flush().catch(() => {})
      await load(true)
    },
    flush: () => flush().catch(() => {}),
  }
}

export const upsertTask = (input: PlannerTaskInput): TaskOp => ({ kind: 'upsert', input })
export const removeTask = (ref: TaskRef): TaskOp => ({ kind: 'remove', ref })
