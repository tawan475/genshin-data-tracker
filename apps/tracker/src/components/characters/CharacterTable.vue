<script setup lang="ts">
import { Heart, Wrench } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import {
  CHARACTER_SORTS,
  TARGET_LEVEL,
  type CharacterSort,
  type CharacterView,
  type SortDirection,
} from '@/data/characters'
import { artifactSetIcon, characterIcon, weaponIcon } from '@/lib/assets'
import FriendshipBadge from './FriendshipBadge.vue'
import SortHeader from './SortHeader.vue'
import SlotPips from './SlotPips.vue'
import TalentChips from './TalentChips.vue'
import { ELEMENT_FILL } from './tokens'

/**
 * The roster as a dense list: one row per character, sortable headers. Rows
 * open the details like the cards do. Columns drop away on narrow screens.
 */
defineProps<{
  characters: CharacterView[]
  /** Show the friendship column (the snapshot has irminsul's values). */
  friendship?: boolean
}>()
defineEmits<{ open: [key: string] }>()
const sort = defineModel<CharacterSort>('sort', { required: true })
const direction = defineModel<SortDirection>('direction', { required: true })

function sortBy(key: CharacterSort) {
  if (sort.value === key) {
    direction.value = direction.value === 'desc' ? 'asc' : 'desc'
    return
  }
  sort.value = key
  direction.value = CHARACTER_SORTS.find((s) => s.value === key)?.natural ?? 'desc'
}

function ariaSort(key: CharacterSort) {
  if (sort.value !== key) return undefined
  return direction.value === 'asc' ? 'ascending' : 'descending'
}

const gapText = (c: CharacterView) => c.gaps.map((g) => g.text).join(' · ')
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <table class="w-full table-fixed text-sm">
      <thead class="border-b border-border-default bg-surface-overlay/50 text-text-secondary">
        <tr>
          <th scope="col" class="px-3 py-2 text-left" :aria-sort="ariaSort('name')">
            <SortHeader
              label="Name"
              :active="sort === 'name'"
              :direction="direction"
              @sort="sortBy('name')"
            />
          </th>
          <th scope="col" class="w-14 px-2 py-2 text-right sm:w-16" :aria-sort="ariaSort('level')">
            <SortHeader
              label="Lv"
              title="Level"
              :active="sort === 'level'"
              :direction="direction"
              @sort="sortBy('level')"
            />
          </th>
          <th
            scope="col"
            class="w-12 px-2 py-2 text-right sm:w-14"
            :aria-sort="ariaSort('constellation')"
          >
            <SortHeader
              label="C"
              title="Constellation"
              :active="sort === 'constellation'"
              :direction="direction"
              @sort="sortBy('constellation')"
            />
          </th>
          <th
            v-if="friendship"
            scope="col"
            class="hidden w-14 px-2 py-2 text-right md:table-cell"
            :aria-sort="ariaSort('friendship')"
          >
            <SortHeader
              label="Friendship"
              title="Friendship"
              :active="sort === 'friendship'"
              :direction="direction"
              @sort="sortBy('friendship')"
            >
              <Heart class="size-4" aria-hidden="true" />
              <span class="sr-only">Friendship</span>
            </SortHeader>
          </th>
          <th
            scope="col"
            class="hidden w-32 px-2 py-2 text-left sm:table-cell"
            :aria-sort="ariaSort('talents')"
          >
            <SortHeader
              label="Talents"
              :active="sort === 'talents'"
              :direction="direction"
              @sort="sortBy('talents')"
            />
          </th>
          <th scope="col" class="hidden w-28 px-2 py-2 text-left font-medium md:table-cell">
            Weapon
          </th>
          <th scope="col" class="hidden w-36 px-2 py-2 text-left font-medium lg:table-cell">
            Sets
          </th>
          <th
            scope="col"
            class="hidden w-28 px-2 py-2 text-right font-medium xl:table-cell"
            title="CRIT Rate / CRIT DMG from artifacts"
          >
            Crit
          </th>
          <th scope="col" class="w-16 px-2 py-2 text-right sm:w-20" :aria-sort="ariaSort('cv')">
            <SortHeader
              label="CV"
              title="Crit value"
              :active="sort === 'cv'"
              :direction="direction"
              @sort="sortBy('cv')"
            />
          </th>
          <th scope="col" class="w-10 px-2 py-2"><span class="sr-only">To do</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-subtle">
        <tr
          v-for="c in characters"
          :key="c.key"
          class="cursor-pointer transition-colors hover:bg-surface-overlay/60"
          @click="$emit('open', c.key)"
        >
          <td class="px-3 py-1.5">
            <button
              type="button"
              aria-haspopup="dialog"
              class="flex w-full min-w-0 items-center gap-2.5 text-left"
              @click.stop="$emit('open', c.key)"
            >
              <GameIcon
                :src="characterIcon(c.key)"
                :name="c.name"
                :rarity="c.rarity ?? undefined"
                size="sm"
              />
              <span
                v-if="c.element"
                class="size-2 shrink-0 rounded-full"
                :class="ELEMENT_FILL[c.element]"
                aria-hidden="true"
              />
              <span class="min-w-0 truncate font-medium">{{ c.name }}</span>
            </button>
          </td>
          <td
            class="tabular px-2 py-1.5 text-right font-mono"
            :class="c.level < TARGET_LEVEL ? 'text-warning-text' : ''"
            :title="`Ascension ${c.ascension}`"
          >
            {{ c.level }}
          </td>
          <td class="tabular px-2 py-1.5 text-right font-mono">{{ c.constellation }}</td>
          <td v-if="friendship" class="hidden px-2 py-1.5 text-right md:table-cell">
            <FriendshipBadge v-if="c.friendship !== null" :level="c.friendship" />
            <span v-else class="text-text-muted">—</span>
          </td>
          <td class="hidden px-2 py-1.5 sm:table-cell">
            <TalentChips :talent="c.talent" />
          </td>
          <td class="hidden px-2 py-1.5 md:table-cell">
            <span
              v-if="c.weapon"
              class="flex items-center gap-1.5"
              :title="`${c.weapon.name} · Lv ${c.weapon.level} · R${c.weapon.refinement}`"
            >
              <GameIcon
                :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
                :name="c.weapon.name"
                :rarity="c.weapon.rarity ?? undefined"
                size="xs"
              />
              <span class="tabular font-mono">R{{ c.weapon.refinement }}</span>
              <span
                class="tabular font-mono"
                :class="c.weapon.level < TARGET_LEVEL ? 'text-warning-text' : 'text-text-muted'"
                >{{ c.weapon.level }}</span
              >
            </span>
            <span v-else class="text-text-muted">—</span>
          </td>
          <td class="hidden px-2 py-1.5 lg:table-cell">
            <span class="flex items-center gap-2">
              <span
                v-for="set in c.activeSets.slice(0, 2)"
                :key="set.setKey"
                class="flex shrink-0 items-center gap-1"
                :title="`${set.name} ×${set.count}`"
              >
                <GameIcon :src="artifactSetIcon(set.setKey)" :name="set.name" size="xs" />
                <span class="tabular font-mono">{{ set.count }}</span>
              </span>
              <SlotPips v-if="c.artifactCount < 5" :count="c.artifactCount" />
            </span>
          </td>
          <td
            class="tabular hidden px-2 py-1.5 text-right font-mono text-text-secondary xl:table-cell"
          >
            <template v-if="c.artifactCount">{{ c.critRate }} / {{ c.critDmg }}</template>
            <template v-else>—</template>
          </td>
          <td class="tabular px-2 py-1.5 text-right font-mono">
            {{ c.artifactCount ? c.cv.toFixed(1) : '—' }}
          </td>
          <td class="px-2 py-1.5 text-right">
            <span v-if="c.gaps.length" class="inline-flex text-warning-text" :title="gapText(c)">
              <Wrench class="size-4" aria-hidden="true" />
              <span class="sr-only">To do: {{ gapText(c) }}</span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
