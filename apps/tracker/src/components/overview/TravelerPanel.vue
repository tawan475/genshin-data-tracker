<script setup lang="ts">
import type { GiPlayer } from '@gdt/shared'
import { computed } from 'vue'
import { Mountain, Zap } from 'lucide-vue-next'
import NamecardBackdrop from '@/components/characters/NamecardBackdrop.vue'
import { formatNumber } from '@/lib/format'

/**
 * The player's card on Overview, design 1B (the user's pick) with the
 * in-game profile: one row of the profile picture (its frame over it), the
 * in-game name and signature with Adventure Rank and its EXP toward the next
 * rank, then World Level and stamina as columns behind a divider; the name
 * card fades in from the right. No UID, no Story Keys (the user's calls).
 * What the capture lacks falls back (`profile`): the account's name, the
 * Traveler's portrait and name card; a figure the capture has no value for
 * is left out.
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
const hasColumns = computed(() => props.player.wl !== undefined || stamina.value !== null)
</script>

<template>
  <section
    class="relative isolate overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-sm"
    :aria-label="$t('overview.traveler.label')"
  >
    <NamecardBackdrop
      v-if="profile.nameCard"
      :src="profile.nameCard"
      class="absolute inset-y-0 right-0 -z-10 h-full w-[70%] object-cover opacity-40 brightness-110 [mask-image:linear-gradient(to_left,black_40%,transparent)]"
    />
    <div class="flex flex-wrap items-center gap-x-6 gap-y-4 px-4 py-4 sm:px-6">
      <span v-if="profile.avatar" class="relative size-24 shrink-0">
        <!-- With a frame, the picture sits inside the game's ring (~80% of it) -->
        <img
          :src="profile.avatar"
          alt=""
          class="absolute rounded-full bg-surface-overlay object-cover"
          :class="
            profile.frame
              ? 'inset-[11%] size-[78%]'
              : 'inset-[6%] size-[88%] ring-2 ring-border-strong'
          "
        />
        <img
          v-if="profile.frame"
          :src="profile.frame"
          alt=""
          class="pointer-events-none absolute inset-0 size-full object-contain"
        />
      </span>

      <div class="flex min-w-0 flex-[1_1_18rem] flex-col gap-2">
        <div class="min-w-0">
          <p class="truncate font-display text-xl font-bold" :title="profile.name">
            {{ profile.name }}
          </p>
          <p
            v-if="profile.signature"
            class="line-clamp-2 text-sm whitespace-pre-line text-text-secondary"
            :title="profile.signature"
          >
            {{ profile.signature }}
          </p>
        </div>
        <div v-if="player.ar !== undefined" class="flex max-w-[560px] flex-col gap-1">
          <p class="flex items-baseline gap-2">
            <span class="text-sm text-text-secondary">{{ $t('overview.traveler.arLabel') }}</span>
            <span class="tabular font-mono text-lg font-semibold">{{ player.ar }}</span>
          </p>
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
            <span
              class="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken"
              aria-hidden="true"
              ><span class="block h-full rounded-full bg-accent" :style="{ width: `${expShare}%` }"
            /></span>
            <span
              v-if="need !== null && player.arExp !== undefined"
              class="tabular shrink-0 font-mono text-sm text-text-secondary"
              >{{ formatNumber(player.arExp) }} / {{ formatNumber(need) }}</span
            >
          </div>
        </div>
      </div>

      <dl
        v-if="hasColumns"
        class="grid grid-cols-2 gap-x-7 gap-y-2 max-sm:w-full max-sm:border-t max-sm:pt-3 sm:border-l sm:pl-6 border-border-default"
      >
        <div v-if="player.wl !== undefined" class="flex flex-col">
          <dt class="flex items-center gap-1.5 text-sm text-text-secondary">
            <Mountain class="size-4" aria-hidden="true" />{{ $t('overview.traveler.wl') }}
          </dt>
          <dd
            class="tabular font-mono text-xl font-medium"
            :title="
              player.wlLimit !== undefined
                ? $t('overview.traveler.wlLimit', { n: player.wlLimit })
                : undefined
            "
          >
            {{ player.wl
            }}<span v-if="player.wlLimit !== undefined" class="text-sm text-text-muted">
              / {{ player.wlLimit }}</span
            >
          </dd>
        </div>
        <div v-if="stamina !== null" class="flex flex-col">
          <dt class="flex items-center gap-1.5 text-sm text-text-secondary">
            <Zap class="size-4" aria-hidden="true" />{{ $t('overview.traveler.stamina') }}
          </dt>
          <dd class="tabular font-mono text-xl font-medium">{{ formatNumber(stamina) }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
