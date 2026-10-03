import { shallowRef, watch, type Ref, type WatchSource } from 'vue'

export interface Resource<T> {
  data: Ref<T | undefined>
  error: Ref<unknown>
  loading: Ref<boolean>
  reload: () => Promise<void>
}

/**
 * Loads `load()` whenever `source` changes, keeping the previous data on
 * screen while the next arrives (no flash to a skeleton on every refresh).
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
    loading.value = true
    error.value = undefined
    try {
      const result = await load(value)
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
