import { loadBundle, type AccountRef, type DecodedBundle } from '@/data/account-data'
import {
  COLLECTION_SECTIONS,
  capturedCollections,
  type CapturedCollections,
} from '@/data/collection-parts'

export {
  COLLECTION_SECTIONS,
  type Captured,
  type CapturedCollections,
} from '@/data/collection-parts'

const decoded = new WeakMap<DecodedBundle, CapturedCollections>()

/** The account's captured collections (one bundle of their sections, cached). */
export async function loadCapturedCollections(account: AccountRef): Promise<CapturedCollections> {
  const bundle = await loadBundle(account, { sections: [...COLLECTION_SECTIONS] })
  let value = decoded.get(bundle)
  if (!value) decoded.set(bundle, (value = capturedCollections(bundle)))
  return value
}
