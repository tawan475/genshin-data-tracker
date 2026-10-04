import { ref } from 'vue'
import { loadMaterialIcons, materialIcon } from '@/lib/assets'

/** Bumped when the (lazy, ~230 KB) material index arrives, so icons re-render. */
const version = ref(0)
let loading: Promise<void> | null = null

/**
 * Starts loading the material index and returns a reactive lookup: ''
 * (GameIcon shows initials) until it is in, then the self-hosted /gi URL, or
 * Enka's for the few icons we do not host.
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
