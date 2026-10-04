<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowUp, Lock } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import { MAX_REFINEMENT, WEAPON_TYPE_LABELS, type WeaponGroup } from '@/data/weapons'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/** Every copy of one weapon: level, refinement, lock and who holds it. */
const props = defineProps<{ group: WeaponGroup; accountId: number }>()

const g = computed(() => props.group)
const equipped = computed(() => g.value.owners.length)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-4">
      <GameIcon
        :src="weaponIcon(g.key, g.best.ascension)"
        :name="g.name"
        :rarity="g.rarity ?? undefined"
        size="lg"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
          <RarityStars v-if="g.rarity" :rarity="g.rarity" />
          <span v-if="g.type">{{ WEAPON_TYPE_LABELS[g.type] }}</span>
        </p>
        <p class="flex flex-wrap gap-x-4 text-sm text-text-secondary">
          <span
            ><span class="tabular font-mono text-lg text-text-primary">{{
              formatNumber(g.count)
            }}</span>
            {{ g.count === 1 ? 'copy' : 'copies' }}</span
          >
          <span v-if="equipped"
            ><span class="tabular font-mono text-lg text-text-primary">{{ equipped }}</span>
            equipped</span
          >
        </p>
      </div>
    </div>

    <ul
      v-if="g.refine"
      class="flex flex-col gap-1 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm"
      :title="`${g.refine.spare} spare ${g.refine.spare === 1 ? 'copy' : 'copies'}`"
    >
      <li v-for="t in g.refine.targets" :key="t.owner" class="flex items-center gap-2">
        <ArrowUp class="size-4 text-success-text" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ t.ownerName }}</span>
        <span class="tabular ml-auto flex items-center gap-1 font-mono text-success-text">
          R{{ t.from }}
          <ArrowRight class="size-3.5" aria-hidden="true" />
          <span class="sr-only">to</span>
          R{{ t.to }}
        </span>
      </li>
    </ul>

    <ul class="divide-y divide-border-subtle rounded-xl border border-border-default">
      <li v-for="row in g.rows" :key="row.id" class="flex items-center gap-3 px-3 py-2">
        <span class="tabular w-14 shrink-0 font-mono" :title="`Ascension ${row.ascension}`"
          >Lv {{ row.level }}</span
        >
        <span
          class="inline-flex shrink-0 items-center gap-1.5"
          :title="`Refinement ${row.refinement} of ${MAX_REFINEMENT}`"
        >
          <span
            class="tabular w-6 font-mono"
            :class="row.refinement >= MAX_REFINEMENT ? 'font-semibold text-accent-text' : ''"
            >R{{ row.refinement }}</span
          >
          <span class="hidden gap-0.5 min-[400px]:inline-flex" aria-hidden="true">
            <span
              v-for="n in MAX_REFINEMENT"
              :key="n"
              class="h-1.5 w-2.5 rounded-full"
              :class="n <= row.refinement ? 'bg-accent' : 'bg-border-strong'"
            />
          </span>
        </span>
        <span class="w-4 shrink-0 text-text-muted">
          <Lock v-if="row.lock" class="size-3.5" aria-label="Locked" />
        </span>
        <RouterLink
          v-if="row.location"
          :to="{
            name: 'account-characters',
            params: { accountId },
            query: { c: row.location },
          }"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md hover:text-accent-text"
        >
          <GameIcon
            :src="characterIcon(row.location)"
            :name="row.ownerName"
            size="xs"
            class="rounded-full!"
          />
          <span class="min-w-0 truncate">{{ row.ownerName }}</span>
        </RouterLink>
        <span v-else class="flex-1" />
        <span
          v-if="row.count > 1"
          class="tabular shrink-0 font-mono text-text-secondary"
          :title="`${formatNumber(row.count)} copies`"
          >×{{ formatNumber(row.count) }}</span
        >
      </li>
    </ul>
  </div>
</template>
