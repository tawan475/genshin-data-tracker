import { shallowRef, watch } from 'vue'
import { api } from '@/api'
import { useFeedback } from '@/stores/feedback'

/** The API takes at most this many ids per list. */
const CHUNK = 5000

/**
 * The account's achievements marked done by hand. Changes show at once
 * (optimistic) and are saved one request at a time, in order; the server's
 * answer replaces the local list once nothing else is waiting. A failed save
 * says so and reloads the list from the server.
 */
export function useAchievementMarks(accountId: () => number) {
  const feedback = useFeedback()
  const marked = shallowRef<ReadonlySet<number>>(new Set())
  /** The account `marked` belongs to; null while the first load runs. */
  const loadedFor = shallowRef<number | null>(null)
  const error = shallowRef<unknown>()
  let generation = 0
  let queue: Promise<unknown> = Promise.resolve()
  let pending = 0

  async function load(id: number) {
    const mine = ++generation
    error.value = undefined
    try {
      const { done } = await api.achievementMarks(id)
      if (mine !== generation) return
      marked.value = new Set(done)
      loadedFor.value = id
    } catch (cause) {
      if (mine === generation) error.value = cause
    }
  }

  watch(
    accountId,
    (id) => {
      loadedFor.value = null
      marked.value = new Set()
      void load(id)
    },
    { immediate: true },
  )

  /** Marks `done` and unmarks `undone`; resolves false when saving failed. */
  function change(done: readonly number[], undone: readonly number[] = []): Promise<boolean> {
    if (done.length === 0 && undone.length === 0) return Promise.resolve(true)
    const id = accountId()
    const next = new Set(marked.value)
    for (const x of done) next.add(x)
    for (const x of undone) next.delete(x)
    marked.value = next
    pending++

    const run = queue.then(async () => {
      try {
        let answer: number[] | null = null
        for (let i = 0; i < done.length; i += CHUNK)
          answer = (await api.updateAchievementMarks(id, { done: done.slice(i, i + CHUNK) })).done
        for (let i = 0; i < undone.length; i += CHUNK)
          answer = (await api.updateAchievementMarks(id, { undone: undone.slice(i, i + CHUNK) }))
            .done
        if (answer && pending === 1 && id === accountId()) marked.value = new Set(answer)
        return true
      } catch (cause) {
        feedback.error('Not saved', cause)
        if (id === accountId()) await load(id)
        return false
      } finally {
        pending--
      }
    })
    queue = run
    return run
  }

  return { marked, loadedFor, error, reload: () => load(accountId()), change }
}
