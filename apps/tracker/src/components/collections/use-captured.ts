import { computed, type ComputedRef } from 'vue'
import { loadCapturedCollections, type CapturedCollections } from '@/data/collections'
import { useResource, type Resource } from '@/data/use-resource'
import { useAccount } from '@/views/account/context'

const NONE: CapturedCollections = {}

/**
 * The account's captured collections for a Collections tab: null while they
 * load (and after an account switch until the new one's arrive).
 */
export function useCapturedCollections(): {
  captured: ComputedRef<CapturedCollections | null>
  resource: Resource<{ accountId: number; captured: CapturedCollections }>
} {
  const account = useAccount()
  // Tagged with the account, so a switch shows a skeleton, not the last account's data.
  const resource = useResource(
    () => account.value,
    async (a) => ({
      accountId: a.id,
      captured: a.latest ? await loadCapturedCollections(a) : NONE,
    }),
  )
  const captured = computed(() => {
    const value = resource.data.value
    return value && value.accountId === account.value.id ? value.captured : null
  })
  return { captured, resource }
}
