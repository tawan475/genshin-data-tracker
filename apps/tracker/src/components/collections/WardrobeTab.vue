<script setup lang="ts">
import { computed } from 'vue'
import { Shirt } from 'lucide-vue-next'
import { WARDROBE_KINDS } from '@gdt/shared'
import NotCaptured from './NotCaptured.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { characterIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import { characterName } from '@/i18n/game-names'
import { t } from '@/i18n'

/**
 * The wardrobe: how many outfits, gliders, weapon skins and trails the
 * player owns (and how many characters wear one), then the saved teams by
 * the names the player gave them. Item names wait for the game data.
 */
const props = defineProps<{ captured: CapturedCollections }>()

const wardrobe = computed(() => props.captured.wardrobe?.value ?? null)
const kinds = computed(() =>
  WARDROBE_KINDS.map((kind) => {
    const value = wardrobe.value?.[kind]
    const worn = value ? Object.keys(value.worn).length : 0
    const expiring = value?.expires ? Object.keys(value.expires).length : 0
    const hint = [
      value && t('collections.wardrobe.wornBy', { n: formatNumber(worn) }),
      expiring && t('collections.wardrobe.expiring', { n: formatNumber(expiring) }),
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      kind,
      label: t(`collections.wardrobe.kinds.${kind}`),
      owned: value?.owned.length,
      hint,
    }
  }),
)
const teams = computed(() =>
  Object.entries(wardrobe.value?.teams ?? {})
    .map(([slot, team]) => ({ slot: Number(slot), ...team }))
    .sort((a, b) => a.slot - b.slot),
)
</script>

<template>
  <NotCaptured v-if="!wardrobe" :title="$t('collections.tabs.wardrobe')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li v-for="kind in kinds" :key="kind.kind" class="flex min-w-0">
        <UiStat
          :label="kind.label"
          :value="kind.owned ?? null"
          exact
          :hint="kind.hint || $t('collections.notCapturedPart')"
        />
      </li>
    </ul>

    <UiPanel :title="$t('collections.wardrobe.teams')" flush>
      <ul
        v-if="teams.length > 0"
        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-px bg-border-subtle"
      >
        <li
          v-for="team in teams"
          :key="team.slot"
          class="flex min-w-0 flex-col gap-2 bg-surface-raised px-4 py-3"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="tabular shrink-0 font-mono text-xs text-text-muted">{{ team.slot }}</span>
            <span class="min-w-0 flex-1 truncate font-medium" :title="team.name">{{
              team.name || '—'
            }}</span>
            <UiBadge v-if="team.slot === wardrobe.currentTeam" tone="accent">{{
              $t('collections.wardrobe.inUse')
            }}</UiBadge>
          </div>
          <div class="flex gap-1.5">
            <GameIcon
              v-for="(key, i) in team.characters"
              :key="`${key}-${i}`"
              :src="characterIcon(key)"
              :name="characterName(key)"
              :title="characterName(key)"
              size="sm"
            />
          </div>
        </li>
      </ul>
      <UiEmpty v-else :title="$t('collections.wardrobe.noTeams')" />
    </UiPanel>

    <UiPanel :title="$t('collections.wardrobe.items')" flush>
      <UiEmpty :title="$t('collections.namesComing')" :body="$t('collections.namesComingBody')">
        <template #icon><Shirt aria-hidden="true" /></template>
      </UiEmpty>
    </UiPanel>
  </div>
</template>
