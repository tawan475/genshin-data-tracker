<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useCapturedCollections } from '@/components/collections/use-captured'
import { characterIcon } from '@/lib/assets'
import { characterName } from '@/i18n/game-names'
import { readStorage, writeStorage } from '@/lib/storage'

/**
 * The saved teams (Teyvat.me Capture's `gi_wardrobe.teams`) by the names the
 * player gave them, the one in use marked; moved here from Collections →
 * Wardrobe (the user's call), at the top of the roster (at its foot it was
 * hard to find, the user). Folded by default; its header opens it, remembered per device.
 * Nothing shows until a capture has them.
 */
const { captured } = useCapturedCollections()
const wardrobe = computed(() => captured.value?.wardrobe?.value ?? null)
const teams = computed(() =>
  Object.entries(wardrobe.value?.teams ?? {})
    .map(([slot, team]) => ({ slot: Number(slot), ...team }))
    .sort((a, b) => a.slot - b.slot),
)
// Folded by default (open it took too much room, the user); opened, it stays open on this device.
const OPEN_KEY = 'characters:teams-open'
const open = ref(readStorage(OPEN_KEY) === '1')
watch(open, (value) => writeStorage(OPEN_KEY, value ? '1' : null))
</script>

<template>
  <UiPanel
    v-if="teams.length > 0"
    v-model:open="open"
    :title="$t('collections.wardrobe.teams')"
    collapsible
    flush
  >
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] overflow-hidden">
      <li
        v-for="team in teams"
        :key="team.slot"
        class="flex min-w-0 flex-col gap-2 px-4 py-3 outline outline-1 outline-border-subtle"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="tabular shrink-0 font-mono text-xs text-text-muted">{{ team.slot }}</span>
          <span class="min-w-0 flex-1 truncate font-medium" :title="team.name">{{
            team.name || '—'
          }}</span>
          <UiBadge v-if="team.slot === wardrobe?.currentTeam" tone="accent">{{
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
  </UiPanel>
</template>
