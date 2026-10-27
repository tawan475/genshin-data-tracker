<script setup lang="ts">
import type { GiPlayer } from '@gdt/shared'
import { computed } from 'vue'
import { Mountain, Zap } from 'lucide-vue-next'
import NamecardBackdrop from '@/components/characters/NamecardBackdrop.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import { characterBanner, characterIcon, gameIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * The Traveler (Capture's `gi_player`): Adventure Rank with its EXP toward
 * the next rank, World Level against the highest it may choose, stamina and
 * Story Keys. A field the capture lacks is left out.
 */
const props = defineProps<{
  player: GiPlayer
  /** EXP the next rank needs (the game data's AR table); null at AR 60 or unknown. */
  need: number | null
}>()

/** In the game's units: 24000 is the 240 it shows. */
const stamina = computed(() =>
  props.player.maxStamina === undefined ? null : Math.round(props.player.maxStamina / 100),
)
const facts = computed(() => {
  const p = props.player
  return [
    p.wl === undefined
      ? null
      : { key: 'wl', icon: Mountain, value: p.wl, limit: p.wlLimit ?? null },
    stamina.value === null ? null : { key: 'stamina', icon: Zap, value: stamina.value },
    p.storyKeys === undefined
      ? null
      : { key: 'storyKeys', image: 'UI_ItemIcon_107', value: p.storyKeys },
  ].filter((f) => f !== null)
})
</script>

<template>
  <section
    class="relative isolate flex flex-wrap items-center gap-x-5 gap-y-4 overflow-hidden rounded-xl border border-border-default bg-surface-raised px-4 py-4 shadow-sm sm:px-5"
    :aria-label="$t('overview.traveler.label')"
  >
    <NamecardBackdrop
      :src="characterBanner('TravelerAnemo')"
      class="absolute inset-y-0 right-0 -z-10 h-full w-full opacity-45 brightness-[1.35] [mask-image:linear-gradient(to_left,black_35%,transparent_95%)] sm:w-[70%] dark:opacity-40 dark:brightness-[1.1]"
    />
    <GameIcon
      :src="characterIcon('Traveler')"
      :name="$t('overview.traveler.label')"
      :rarity="5"
      size="lg"
      eager
    />
    <div class="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5">
      <p class="flex flex-wrap items-baseline gap-x-3">
        <span class="font-display text-xl font-bold">{{
          player.ar === undefined
            ? $t('overview.traveler.label')
            : $t('overview.traveler.ar', { n: player.ar })
        }}</span>
        <span
          v-if="player.uid"
          class="tabular font-mono text-sm text-text-muted"
          :title="$t('overview.traveler.uid', { uid: player.uid })"
          >{{ player.uid }}</span
        >
      </p>
      <div
        v-if="player.arExp !== undefined && need"
        class="flex max-w-xl items-center gap-3"
        :title="
          $t('overview.traveler.arExp', {
            exp: formatNumber(player.arExp),
            need: formatNumber(need),
          })
        "
      >
        <UiProgress :value="player.arExp" :max="need" :label="$t('overview.traveler.arExpLabel')" />
        <span class="tabular shrink-0 font-mono text-sm text-text-secondary">
          {{ formatNumber(player.arExp)
          }}<span class="text-text-muted"> / {{ formatNumber(need) }}</span>
        </span>
      </div>
    </div>
    <dl
      v-if="facts.length"
      class="grid w-full grid-cols-3 gap-x-4 gap-y-2 sm:w-auto sm:gap-x-7 sm:border-l sm:border-border-default sm:pl-5"
    >
      <div v-for="fact in facts" :key="fact.key" class="flex min-w-0 flex-col gap-0.5">
        <dt class="flex items-center gap-1.5 text-sm text-text-secondary">
          <component :is="fact.icon" v-if="'icon' in fact" class="size-4" aria-hidden="true" />
          <img
            v-else
            :src="gameIcon(fact.image)"
            alt=""
            class="size-[1.125rem] object-contain"
            aria-hidden="true"
          />
          <span class="truncate">{{ $t(`overview.traveler.${fact.key}`) }}</span>
        </dt>
        <dd
          class="tabular font-mono text-xl font-medium"
          :title="
            'limit' in fact && fact.limit !== null
              ? $t('overview.traveler.wlLimit', { n: fact.limit })
              : undefined
          "
        >
          {{ formatNumber(fact.value)
          }}<span v-if="'limit' in fact && fact.limit !== null" class="text-base text-text-muted">
            / {{ fact.limit }}</span
          >
        </dd>
      </div>
    </dl>
  </section>
</template>
