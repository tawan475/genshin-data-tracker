<script setup lang="ts">
import { wishItemName } from './item-name'
import { computed } from 'vue'
import { CircleArrowUp } from 'lucide-vue-next'
import type { BannerStats } from '@/data/wish-history'
import { t } from '@/i18n'
import { oddsOf } from './wish-labels'

/**
 * What the next 5★ is: "Guaranteed" (the last 50/50 was lost) or a coin flip
 * ("50/50", "75/25" on the weapon banner). Nothing on banners without one,
 * or when a pull outside the banner data left it unknown.
 */
const props = defineProps<{ stats: BannerStats; icon?: boolean }>()

const chip = computed(() => {
  const s = props.stats
  if (s.guaranteed5 === null) return null
  if (s.guaranteed5) {
    const last = s.fives[0]
    return {
      text: t('wishes.odds.guaranteed'),
      sure: true,
      title: last
        ? t('wishes.odds.lostLast', { odds: oddsOf(s.banner), name: wishItemName(last.pull.item) })
        : t('wishes.odds.nextFeatured'),
    }
  }
  return {
    text: oddsOf(s.banner),
    sure: false,
    title: s.banner === 302 ? t('wishes.odds.weapon') : t('wishes.odds.coin'),
  }
})
</script>

<template>
  <span
    v-if="chip"
    class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="
      chip.sure
        ? 'border-accent-text bg-accent/15 text-accent-text'
        : 'border-border-strong text-text-secondary'
    "
    :title="chip.title"
  >
    <CircleArrowUp v-if="icon && chip.sure" class="size-4" aria-hidden="true" />{{ chip.text }}
  </span>
</template>
