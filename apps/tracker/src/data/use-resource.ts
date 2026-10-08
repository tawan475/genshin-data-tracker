import { shallowRef, watch, type Ref, type WatchSource } from 'vue'

export interface Resource<T> {
  data: Ref<T | undefined>
  error: Ref<unknown>
  loading: Ref<boolean>
  reload: () => Promise<void>
}

/**
 * What each loader promise resolved to, once it has: the data modules hand
 * out the same cached promise for the same data (account-data `cached`), so a
 * page opened after another loaded it reads it at once instead of awaiting
 * a settled promise (which always costs a frame of skeleton).
 */
const settled = new WeakMap<Promise<unknown>, unknown>()

/**
 * Loads `load()` whenever `source` changes, keeping the previous data on
 * screen while the next arrives (no flash to a skeleton on every refresh).
 * Data another page already loaded shows on the first frame (`settled`).
 * Responses that arrive out of order are dropped.
 */
export function useResource<T, S>(
  source: WatchSource<S>,
  load: (value: S) => Promise<T>,
): Resource<T> {
  const data = shallowRef<T>()
  const error = shallowRef<unknown>()
  const loading = shallowRef(false)
  let generation = 0
  let current: S

  async function run(value: S) {
    const mine = ++generation
    const promise = load(value)
    if (settled.has(promise)) {
      data.value = settled.get(promise) as T
      loading.value = false
      error.value = undefined
      return
    }
    loading.value = true
    error.value = undefined
    try {
      const result = await promise
      settled.set(promise, result)
      if (mine === generation) data.value = result
    } catch (cause) {
      if (mine === generation) error.value = cause
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  watch(
    source,
    (value) => {
      current = value
      void run(value)
    },
    { immediate: true },
  )

  return { data, error, loading, reload: () => run(current) }
}

/**
 * Loads ahead (a page the user will likely open): once `promise` settles,
 * a page that asks for the same cached promise shows it on its first frame.
 * Never rejects.
 */
export function preload<T>(promise: Promise<T>): void {
  promise.then(
    (value) => void settled.set(promise, value),
    () => undefined,
  )
}
