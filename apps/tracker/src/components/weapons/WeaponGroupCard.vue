<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import { MAX_REFINEMENT, WEAPON_TYPE_LABELS, type WeaponGroup } from '@/data/weapons'
import { weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import OwnerAvatars from './OwnerAvatars.vue'
import RefineBadge from './RefineBadge.vue'

/** One weapon with every matching copy: best level and refinement, owners, refine headroom. */
const props = defineProps<{ group: WeaponGroup }>()
defineEmits<{ open: [] }>()

const g = computed(() => props.group)
const label = computed(
  () =>
    `${g.value.name}, ${g.value.count} ${g.value.count === 1 ? 'copy' : 'copies'}, best level ${g.value.best.level} R${g.value.best.refinement}`,
)
</script>

<template>
  <button
    type="button"
    aria-haspopup="dialog"
    :aria-label="label"
    class="flex w-full items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3 text-left shadow-sm transition-colors hover:border-border-strong"
    @click="$emit('open')"
  >
    <GameIcon
      :src="weaponIcon(g.key, g.best.ascension)"
      :name="g.name"
      :rarity="g.rarity ?? undefined"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate font-medium" :title="g.name">{{ g.name }}</p>
        <span
          v-if="g.count > 1"
          class="tabular shrink-0 font-mono text-sm text-text-secondary"
          :title="`${formatNumber(g.count)} copies`"
          >×{{ formatNumber(g.count) }}</span
        >
      </div>
      <p class="flex items-center gap-2 text-xs text-text-muted">
        <RarityStars v-if="g.rarity" :rarity="g.rarity" class="[&_svg]:size-3" />
        <span v-if="g.type">{{ WEAPON_TYPE_LABELS[g.type] }}</span>
      </p>
      <div class="flex min-w-0 items-center gap-2 text-sm">
        <span
          class="tabular font-mono whitespace-nowrap"
          :title="`Best copy: Lv ${g.best.level} · A${g.best.ascension} · R${g.best.refinement}`"
        >
          <span :class="g.best.level >= 90 ? '' : 'text-text-secondary'"
            >Lv {{ g.best.level }}</span
          >
          <span class="text-text-muted"> · </span>
          <span :class="g.best.refinement >= MAX_REFINEMENT ? 'font-semibold text-accent-text' : ''"
            >R{{ g.best.refinement }}</span
          >
        </span>
        <RefineBadge v-if="g.refine" :refine="g.refine" />
        <span class="ml-auto flex shrink-0 items-center gap-2">
          <OwnerAvatars :owners="g.owners" />
        </span>
      </div>
    </div>
  </button>
</template>
