import { ref } from 'vue'
import { loadMaterialIcons, materialIcon } from '@/lib/assets'

/** Bumped when the (lazy, ~250 KB) icon table arrives, so icons re-render. */
const version = ref(0)
let loading: Promise<void> | null = null

/**
 * Starts loading the material icon table and returns a reactive lookup:
 * '' (GameIcon shows initials) until the table is in, then the Enka URL.
 */
export function useMaterialIcons(): (key: string) => string {
  loading ??= loadMaterialIcons().then(
    () => void version.value++,
    () => void (loading = null),
  )
  return (key) => {
    void version.value
    return materialIcon(key)
  }
}
