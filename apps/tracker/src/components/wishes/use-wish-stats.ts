import { computed, type Ref } from 'vue'
import type { UigfGachaType } from '@gdt/shared'
import { useResource } from '@/data/use-resource'
import {
  bannerStats,
  eventBanners,
  type BannerFile,
  type BannerStats,
  type WishHistory,
} from '@/data/wish-history'
import { loadGameIcons } from '@/lib/assets'
import { WISH_BANNERS } from './wish-labels'

let bannerFile: Promise<BannerFile> | null = null

/** Banner dates and featured items (paimon.moe's data, MIT) and the icon names: one cached load. */
function loadBannerFile(): Promise<BannerFile> {
  bannerFile ??= Promise.all([
    import('@/data/wish-banners.json').then((m) => m.default as unknown as BannerFile),
    loadGameIcons(),
  ]).then(([file]) => file)
  bannerFile.catch(() => (bannerFile = null))
  return bannerFile
}

/** Every banner's figures, computed once per history (and per banner data). */
export function useWishStats(history: Ref<WishHistory | undefined>) {
  const file = useResource(() => 0, loadBannerFile)
  const stats = computed(() => {
    const h = history.value
    const f = file.data.value
    if (!h || !f) return null
    const events = eventBanners(f, h.timezone)
    const out = new Map<UigfGachaType, BannerStats>()
    for (const { banner } of WISH_BANNERS) {
      out.set(
        banner,
        bannerStats(banner, h.banners.get(banner) ?? [], { timezone: h.timezone, banners: events }),
      )
    }
    return out
  })
  return { stats, error: file.error, reload: file.reload }
}
