<script setup lang="ts">
import { computed, ref } from 'vue'
import { Lock } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
import { WEAPON_TYPE_LABELS, type WeaponRow } from '@/data/weapons'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/** One weapon, or a stack of identical unequipped copies (×N). Visual only. */
const props = defineProps<{ weapon: WeaponRow }>()

const details = computed(() =>
  [
    props.weapon.rarity ? `${props.weapon.rarity}★` : null,
    props.weapon.type ? WEAPON_TYPE_LABELS[props.weapon.type] : null,
  ]
    .filter(Boolean)
    .join(' · '),
)

// The owner's portrait is a small inline avatar; hide it if the image fails.
const avatarFailed = ref(false)
</script>

<template>
  <article
    class="flex w-full items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
  >
    <GameIcon
      :src="weaponIcon(weapon.key, weapon.ascension)"
      :name="weapon.name"
      :rarity="weapon.rarity ?? undefined"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate font-medium" :title="`${weapon.name} · ${details}`">{{ weapon.name }}</p>
        <span
          v-if="weapon.count > 1"
          class="tabular shrink-0 font-mono text-sm text-text-secondary"
          :title="`${weapon.count} copies`"
          >×{{ formatNumber(weapon.count) }}</span
        >
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span class="tabular font-mono whitespace-nowrap">
          <LevelText :level="weapon.level" :ascension="weapon.ascension" />
          <span class="text-text-muted"> · </span>R{{ weapon.refinement }}
        </span>
        <span v-if="weapon.lock" class="inline-flex text-text-muted" title="Locked">
          <Lock class="size-4" aria-hidden="true" />
          <span class="sr-only">Locked</span>
        </span>
        <span v-if="weapon.location" class="ml-auto inline-flex shrink-0" :title="weapon.ownerName">
          <img
            v-if="!avatarFailed && characterIcon(weapon.location)"
            :src="characterIcon(weapon.location)"
            alt=""
            loading="lazy"
            decoding="async"
            class="size-7 rounded-md bg-surface-sunken object-cover"
            @error="avatarFailed = true"
          />
          <span :class="avatarFailed || !characterIcon(weapon.location) ? 'truncate' : 'sr-only'">
            <span class="sr-only">Equipped by </span>{{ weapon.ownerName }}
          </span>
        </span>
      </div>
    </div>
  </article>
</template>
