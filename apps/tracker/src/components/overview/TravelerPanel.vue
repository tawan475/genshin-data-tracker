<script setup lang="ts">
import type { GiPlayer } from '@gdt/shared'
import { computed } from 'vue'
import NamecardBackdrop from '@/components/characters/NamecardBackdrop.vue'
import { formatNumber } from '@/lib/format'

/**
 * The player's profile, laid out like the game's own profile card: the name
 * card as the background, the profile picture, the in-game name and
 * signature, then Adventure Rank with its EXP toward the next rank, World
 * Level and stamina as rows (no Story Keys: the user's call). No UID (the user's call). What the
 * capture lacks falls back (`profile`): the account's name, the Traveler's
 * portrait and name card; a row the capture has no value for is left out.
 */
const props = defineProps<{
  player: GiPlayer
  /** EXP the next rank needs (the game data's AR table); null at AR 60 or unknown. */
  need: number | null
  profile: {
    name: string
    signature: string | null
    /** The name card's picture (a full image URL), '' for none. */
    nameCard: string
    /** The profile picture (a full image URL), '' for none. */
    avatar: string
    /** Its frame (a full image URL), '' for none. */
    frame: string
  }
}>()

/** In the game's units: 24000 is the 240 it shows. */
const stamina = computed(() =>
  props.player.maxStamina === undefined ? null : Math.round(props.player.maxStamina / 100),
)
const expShare = computed(() => {
  const exp = props.player.arExp
  if (props.need === null) return props.player.ar === 60 ? 100 : null
  return exp === undefined ? null : Math.min(100, (exp / props.need) * 100)
})
const rows = computed(() => {
  const p = props.player
  return [
    p.wl === undefined
      ? null
      : {
          key: 'wl',
          value: formatNumber(p.wl),
          title: p.wlLimit !== undefined ? 'wlLimit' : undefined,
        },
    stamina.value === null ? null : { key: 'stamina', value: formatNumber(stamina.value) },
  ].filter((row) => row !== null)
})
</script>

<template>
  <section
    class="relative isolate overflow-hidden rounded-xl border border-border-default bg-surface-raised text-white shadow-sm"
    :aria-label="$t('overview.traveler.label')"
  >
    <NamecardBackdrop
      v-if="profile.nameCard"
      :src="profile.nameCard"
      class="absolute inset-0 -z-20 h-full w-full object-cover"
    />
    <!-- The game's card is light over its art; here a dark veil keeps the white text readable -->
    <span
      class="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/85 via-slate-950/65 to-slate-950/35"
      aria-hidden="true"
    />
    <div class="flex flex-wrap items-center gap-x-6 gap-y-4 px-4 py-5 sm:px-6">
      <span v-if="profile.avatar" class="relative size-24 shrink-0 sm:size-28">
        <!-- With a frame, the picture sits inside the game's ring (~80% of it) -->
        <img
          :src="profile.avatar"
          alt=""
          class="absolute rounded-full bg-white/10 object-cover"
          :class="
            profile.frame ? 'inset-[11%] size-[78%]' : 'inset-[8%] size-[84%] ring-4 ring-white/25'
          "
        />
        <img
          v-if="profile.frame"
          :src="profile.frame"
          alt=""
          class="pointer-events-none absolute inset-0 size-full object-contain"
        />
      </span>
      <div class="flex min-w-0 flex-[1_1_18rem] flex-col gap-3">
        <div class="flex min-w-0 flex-col">
          <p class="truncate font-display text-2xl font-bold drop-shadow" :title="profile.name">
            {{ profile.name }}
          </p>
          <p
            v-if="profile.signature"
            class="line-clamp-3 text-sm whitespace-pre-line text-white/80"
            :title="profile.signature"
          >
            {{ profile.signature }}
          </p>
        </div>
        <dl class="flex max-w-2xl flex-col gap-1.5 text-sm">
          <div v-if="player.ar !== undefined" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3">
              <dt class="font-medium text-white/85">{{ $t('overview.traveler.arLabel') }}</dt>
              <dd class="tabular font-mono text-lg font-semibold">{{ player.ar }}</dd>
            </div>
            <div
              v-if="expShare !== null"
              class="flex items-center gap-3"
              :title="
                need !== null && player.arExp !== undefined
                  ? $t('overview.traveler.arExp', {
                      exp: formatNumber(player.arExp),
                      need: formatNumber(need),
                    })
                  : undefined
              "
            >
              <span class="shrink-0 text-xs text-white/70">{{
                $t('overview.traveler.arExpLabel')
              }}</span>
              <span
                class="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/20"
                aria-hidden="true"
                ><span
                  class="block h-full rounded-full bg-lime-400"
                  :style="{ width: `${expShare}%` }"
              /></span>
              <span
                v-if="need !== null && player.arExp !== undefined"
                class="tabular shrink-0 font-mono text-xs text-white/80"
                >{{ formatNumber(player.arExp) }} / {{ formatNumber(need) }}</span
              >
            </div>
          </div>
          <div
            v-for="row in rows"
            :key="row.key"
            class="flex items-baseline justify-between gap-3 border-t border-white/10 pt-1.5"
          >
            <dt class="flex items-center gap-1.5 font-medium text-white/85">
              {{ $t(`overview.traveler.${row.key}`) }}
            </dt>
            <dd
              class="tabular font-mono text-lg font-semibold"
              :title="
                row.title && player.wlLimit !== undefined
                  ? $t('overview.traveler.wlLimit', { n: player.wlLimit })
                  : undefined
              "
            >
              {{ row.value }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
