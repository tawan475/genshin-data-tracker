<script setup lang="ts">
import { Wrench } from 'lucide-vue-next'
import CritValue from '@/components/ui/CritValue.vue'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import LevelText from '@/components/ui/LevelText.vue'
import {
  CHARACTER_SORTS,
  TARGET_LEVEL,
  type CharacterSort,
  type CharacterView,
  type SortDirection,
} from '@/data/characters'
import { artifactSetIcon, characterIcon, weaponIcon } from '@/lib/assets'
import { useExpNeed } from '@/lib/exp-need'
import { formatNumber } from '@/lib/format'
import { formatLevel } from '@/lib/level'
import { t } from '@/i18n'
import FavoriteStar from './FavoriteStar.vue'
import FriendshipBadge from './FriendshipBadge.vue'
import SortHeader from './SortHeader.vue'
import TalentChips from './TalentChips.vue'

/**
 * The roster as a dense list: one row per character, sortable headers. Rows
 * open the details like the cards do; the first column is the favourite
 * star. Columns drop away on narrow screens (Crit only on the widest, so the
 * name keeps room beside the sidebar and the friendship column).
 */
const props = defineProps<{
  characters: CharacterView[]
  /** Show the friendship column (the snapshot has irminsul's values). */
  friendship?: boolean
  favorites?: ReadonlySet<string>
}>()
defineEmits<{ open: [key: string]; favorite: [key: string] }>()
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

/**
 * The cards' two bars as thin lines under the Lv and Friendship cells (design
 * 2C): full at the cap, else the EXP toward the next level; none when the
 * capture sent no EXP.
 */
const expNeed = useExpNeed()
function levelBar(c: CharacterView): { percent: number; title: string } | null {
  const need = expNeed.value?.character(c.level, c.ascension)
  if (need === undefined || (need !== null && c.exp === null)) return null
  if (need === null) return { percent: 100, title: t('characters.card.levelMax') }
  return {
    percent: Math.min(100, ((c.exp ?? 0) / need) * 100),
    title: t('characters.card.levelExp', {
      exp: formatNumber(c.exp ?? 0),
      need: formatNumber(need),
    }),
  }
}
function friendshipBar(c: CharacterView): { percent: number; title: string } | null {
  if (c.friendship === null) return null
  const need = expNeed.value?.friendship(c.friendship)
  if (need === undefined) return null
  if (need === null)
    return { percent: 100, title: t('characters.friendship.title', { level: c.friendship }) }
  if (c.friendshipExp === null) return null
  return {
    percent: Math.min(100, (c.friendshipExp / need) * 100),
    title: t('characters.card.friendshipExp', {
      level: c.friendship,
      exp: formatNumber(c.friendshipExp),
      need: formatNumber(need),
    }),
  }
}
const isFavorite = (c: CharacterView) => props.favorites?.has(c.key) ?? false
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <table class="w-full table-fixed text-sm">
      <thead class="border-b border-border-default bg-surface-overlay/50 text-text-secondary">
        <tr>
          <th scope="col" class="w-8 py-2 pl-1">
            <span class="sr-only">{{ $t('characters.favorite.on') }}</span>
          </th>
          <th scope="col" class="py-2 pr-2 pl-1 text-left" :aria-sort="ariaSort('name')">
            <SortHeader
              :label="$t('characters.sort.name')"
              :active="sort === 'name'"
              :direction="direction"
              @sort="sortBy('name')"
            />
          </th>
          <th scope="col" class="w-16 px-2 py-2 text-right sm:w-20" :aria-sort="ariaSort('level')">
            <SortHeader
              :label="$t('characters.table.lv')"
              :title="$t('characters.sort.level')"
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
              :label="$t('characters.table.c')"
              :title="$t('game.constellation')"
              :active="sort === 'constellation'"
              :direction="direction"
              @sort="sortBy('constellation')"
            />
          </th>
          <th
            v-if="friendship"
            scope="col"
            class="hidden w-24 px-2 py-2 text-right md:table-cell"
            :aria-sort="ariaSort('friendship')"
          >
            <SortHeader
              :label="$t('game.friendship')"
              :active="sort === 'friendship'"
              :direction="direction"
              @sort="sortBy('friendship')"
            />
          </th>
          <th
            scope="col"
            class="hidden w-32 px-2 py-2 text-left sm:table-cell"
            :aria-sort="ariaSort('talents')"
          >
            <SortHeader
              :label="$t('game.talents')"
              :active="sort === 'talents'"
              :direction="direction"
              @sort="sortBy('talents')"
            />
          </th>
          <th scope="col" class="hidden w-32 px-2 py-2 text-left font-medium md:table-cell">
            {{ $t('game.weapon') }}
          </th>
          <th scope="col" class="hidden w-36 px-2 py-2 text-left font-medium lg:table-cell">
            {{ $t('characters.sets') }}
          </th>
          <th
            scope="col"
            class="hidden w-28 px-2 py-2 text-right font-medium 2xl:table-cell"
            :title="$t('characters.table.critTitle')"
          >
            {{ $t('characters.table.crit') }}
          </th>
          <th scope="col" class="w-16 px-2 py-2 text-right sm:w-20" :aria-sort="ariaSort('cv')">
            <SortHeader
              label="CV"
              :title="$t('artifacts.sortTitle.cv')"
              :active="sort === 'cv'"
              :direction="direction"
              @sort="sortBy('cv')"
            />
          </th>
          <th scope="col" class="w-10 px-2 py-2">
            <span class="sr-only">{{ $t('characters.table.toDo') }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-subtle">
        <tr
          v-for="c in characters"
          :key="c.key"
          class="group/fav cursor-pointer transition-colors hover:bg-surface-overlay/60"
          @click="$emit('open', c.key)"
        >
          <td class="py-1.5 pl-1">
            <FavoriteStar :on="isFavorite(c)" :name="c.name" @toggle="$emit('favorite', c.key)" />
          </td>
          <td class="py-1.5 pr-2 pl-1">
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
              <ElementIcon v-if="c.element" :element="c.element" />
              <span class="min-w-0 truncate font-medium">{{ c.name }}</span>
            </button>
          </td>
          <td class="px-2 py-1.5 text-right" :title="levelBar(c)?.title">
            <LevelText :level="c.level" :ascension="c.ascension" :target="TARGET_LEVEL" bare />
            <span
              v-if="levelBar(c)"
              class="mt-1 block h-[3px] overflow-hidden rounded-full bg-surface-sunken"
              aria-hidden="true"
              ><span
                class="block h-full rounded-full bg-accent"
                :style="{ width: `${levelBar(c)!.percent}%` }"
            /></span>
          </td>
          <td class="tabular px-2 py-1.5 text-right font-mono">{{ c.constellation }}</td>
          <td
            v-if="friendship"
            class="hidden px-2 py-1.5 text-right md:table-cell"
            :title="friendshipBar(c)?.title"
          >
            <FriendshipBadge v-if="c.friendship !== null" :level="c.friendship" bare />
            <span v-else class="text-text-muted">—</span>
            <span
              v-if="friendshipBar(c)"
              class="mt-1 ml-auto block h-[3px] w-full max-w-16 overflow-hidden rounded-full bg-surface-sunken"
              aria-hidden="true"
              ><span
                class="block h-full rounded-full bg-friendship"
                :style="{ width: `${friendshipBar(c)!.percent}%` }"
            /></span>
          </td>
          <td class="hidden px-2 py-1.5 sm:table-cell">
            <TalentChips :talent="c.talent" />
          </td>
          <td class="hidden px-2 py-1.5 md:table-cell">
            <span
              v-if="c.weapon"
              class="flex items-center gap-1.5"
              :title="`${c.weapon.name} · ${formatLevel(c.weapon.level, c.weapon.ascension)} · R${c.weapon.refinement}`"
            >
              <GameIcon
                :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
                :name="c.weapon.name"
                :rarity="c.weapon.rarity ?? undefined"
                size="xs"
              />
              <span class="tabular font-mono">R{{ c.weapon.refinement }}</span>
              <LevelText
                :level="c.weapon.level"
                :ascension="c.weapon.ascension"
                :target="TARGET_LEVEL"
                bare
              />
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
                <GameIcon
                  :src="artifactSetIcon(set.setKey)"
                  :name="set.name"
                  :rarity="set.rarity"
                  size="xs"
                />
                <span class="tabular font-mono">{{ set.count }}</span>
              </span>
              <span v-if="!c.activeSets.length" class="text-text-muted">—</span>
            </span>
          </td>
          <td
            class="tabular hidden px-2 py-1.5 text-right font-mono text-text-secondary 2xl:table-cell"
          >
            <template v-if="c.artifactCount">{{ c.critRate }} / {{ c.critDmg }}</template>
            <template v-else>—</template>
          </td>
          <td class="px-2 py-1.5 text-right">
            <CritValue v-if="c.artifactCount" :value="c.cv" scope="build" />
            <span v-else class="text-text-muted">—</span>
          </td>
          <td class="px-2 py-1.5 text-right">
            <span v-if="c.gaps.length" class="inline-flex text-warning-text" :title="gapText(c)">
              <Wrench class="size-4" aria-hidden="true" />
              <span class="sr-only">{{
                $t('characters.table.toDoList', { gaps: gapText(c) })
              }}</span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
