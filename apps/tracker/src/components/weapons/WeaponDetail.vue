<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowUp, Backpack, Lock } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import {
  MAX_REFINEMENT,
  WEAPON_TYPE_LABELS,
  weaponTitle,
  type WeaponGroup,
  type WeaponRow,
} from '@/data/weapons'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * Every copy of one weapon. The head is the chosen copy as the game shows a
 * selected weapon ("R5 · Lv. 90/90", refinement diamonds, who wears it);
 * below, one line per copy or stack of spare copies, the chosen one
 * highlighted. Picking a line chooses it.
 */
const props = defineProps<{ group: WeaponGroup; selectedId: string | null; accountId: number }>()
const emit = defineEmits<{ select: [id: string] }>()

const g = computed(() => props.group)
const selected = computed<WeaponRow>(
  () => g.value.rows.find((r) => r.id === props.selectedId) ?? g.value.best,
)
const equipped = computed(() => g.value.owners.length)
const refinementTitle = (r: number) => `Refinement Rank ${r} of ${MAX_REFINEMENT}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-4">
      <GameIcon
        :src="weaponIcon(g.key, selected.ascension)"
        :name="g.name"
        :rarity="g.rarity ?? undefined"
        size="lg"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
          <RarityStars v-if="g.rarity" :rarity="g.rarity" />
          <span v-if="g.type">{{ WEAPON_TYPE_LABELS[g.type] }}</span>
        </p>
        <p class="flex flex-wrap items-center gap-x-2 text-lg">
          <span
            class="tabular font-mono font-semibold"
            :class="selected.refinement >= MAX_REFINEMENT ? 'text-accent-text' : ''"
            :title="refinementTitle(selected.refinement)"
            >R{{ selected.refinement }}</span
          >
          <span class="text-text-muted" aria-hidden="true">·</span>
          <LevelText :level="selected.level" :ascension="selected.ascension" />
        </p>
        <p class="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
          <span
            class="inline-flex shrink-0 gap-1"
            role="img"
            :aria-label="refinementTitle(selected.refinement)"
            :title="refinementTitle(selected.refinement)"
          >
            <span
              v-for="n in MAX_REFINEMENT"
              :key="n"
              class="size-2 rotate-45 rounded-[1px]"
              :class="n <= selected.refinement ? 'bg-accent' : 'bg-border-strong'"
            />
          </span>
          <template v-if="selected.location">
            <GameIcon
              :src="characterIcon(selected.location)"
              :name="selected.ownerName"
              size="xs"
              class="rounded-full!"
            />
            <span class="min-w-0 truncate">{{ selected.ownerName }}</span>
          </template>
          <span v-else class="inline-flex items-center gap-1.5">
            <Backpack class="size-4" aria-hidden="true" />
            Unequipped
          </span>
          <Lock v-if="selected.lock" class="size-4 shrink-0" aria-label="Locked" />
        </p>
      </div>
    </div>

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

    <ul
      class="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-default"
      aria-label="Copies"
    >
      <li
        v-for="row in g.rows"
        :key="row.id"
        class="relative flex min-h-11 items-center gap-3 px-3 py-1.5 transition-colors"
        :class="row.id === selected.id ? 'bg-accent/10' : 'hover:bg-surface-overlay/60'"
      >
        <button
          type="button"
          class="absolute inset-0"
          :aria-label="weaponTitle(row)"
          :aria-pressed="row.id === selected.id"
          @click="emit('select', row.id)"
        />
        <LevelText :level="row.level" :ascension="row.ascension" class="w-20 shrink-0" />
        <span
          class="inline-flex shrink-0 items-center gap-1.5"
          :title="refinementTitle(row.refinement)"
        >
          <span
            class="tabular w-6 font-mono"
            :class="row.refinement >= MAX_REFINEMENT ? 'font-semibold text-accent-text' : ''"
            >R{{ row.refinement }}</span
          >
          <span class="hidden gap-1 min-[400px]:inline-flex" aria-hidden="true">
            <span
              v-for="n in MAX_REFINEMENT"
              :key="n"
              class="size-1.5 rotate-45 rounded-[1px]"
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
          class="relative z-10 flex min-w-0 flex-1 items-center gap-2 rounded-md hover:text-accent-text"
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
