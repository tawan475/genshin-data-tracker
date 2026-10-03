<script setup lang="ts">
import { Hourglass } from 'lucide-vue-next'
import RarityStars from '@/components/ui/RarityStars.vue'

/**
 * A static artifact card for the landing page, built from the kit rather than
 * a screenshot. The numbers are self-consistent: each substat is the sum of
 * its listed 5★ roll tiers, CV = 2 × CRIT Rate + CRIT DMG, and RV is the
 * shared calculateRV (sum of value / max roll, rounded to 10).
 */
interface Substat {
  name: string
  value: string
  /** Each roll as a share of the stat's highest roll tier (0.7, 0.8, 0.9 or 1). */
  rolls: number[]
}

const substats: Substat[] = [
  { name: 'CRIT Rate', value: '10.5%', rolls: [0.9, 0.8, 1] },
  { name: 'CRIT DMG', value: '21.0%', rolls: [0.9, 0.8, 1] },
  { name: 'ATK%', value: '5.8%', rolls: [1] },
  { name: 'Elemental Mastery', value: '19', rolls: [0.8] },
]

/** A 5★ artifact rolls a substat at most 6 times. */
const SLOTS = 6

const quality = (rolls: number[]) =>
  `${Math.round((rolls.reduce((sum, r) => sum + r, 0) / rolls.length) * 100)}%`
</script>

<template>
  <article
    class="flex flex-col gap-4 rounded-xl border border-border-default bg-surface-raised p-4"
  >
    <div class="flex items-start gap-3">
      <span
        class="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-rarity-5/20 text-rarity-5"
      >
        <Hourglass class="size-6" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">Emblem of Severed Fate</p>
        <p class="text-sm text-text-secondary">
          Sands · <span class="tabular font-mono">+20</span> · on Raiden Shogun
        </p>
        <RarityStars :rarity="5" class="mt-1" />
      </div>
    </div>

    <div class="flex items-baseline justify-between gap-3 border-y border-border-subtle py-2">
      <span class="text-text-secondary">Energy Recharge</span>
      <span class="tabular font-mono text-lg font-medium">51.8%</span>
    </div>

    <ul class="flex flex-col gap-3">
      <li v-for="sub in substats" :key="sub.name" class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="truncate">{{ sub.name }}</span>
          <span class="tabular font-mono">{{ sub.value }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="flex flex-1 gap-1">
            <span
              v-for="slot in SLOTS"
              :key="slot"
              class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
            >
              <span
                v-if="sub.rolls[slot - 1]"
                class="block h-full rounded-full bg-text-secondary"
                :style="{ width: `${(sub.rolls[slot - 1] ?? 0) * 100}%` }"
              />
            </span>
          </span>
          <span class="tabular shrink-0 font-mono text-sm text-text-muted"
            >{{ sub.rolls.length }}× · {{ quality(sub.rolls) }}</span
          >
        </div>
      </li>
    </ul>

    <dl class="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3">
      <div>
        <dt class="text-sm text-text-secondary">Crit value</dt>
        <dd class="tabular font-mono text-xl font-medium">42.0</dd>
      </div>
      <div>
        <dt class="text-sm text-text-secondary">Roll value</dt>
        <dd class="tabular font-mono text-xl font-medium">720%</dd>
      </div>
    </dl>
  </article>
</template>
