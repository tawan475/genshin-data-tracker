<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Lock } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import type { AccountRef } from '@/data/account-data'
import {
  ELEMENT_LABELS,
  SLOT_ORDER,
  WEAPON_TYPE_LABELS,
  artifactTotals,
  type CharacterView,
} from '@/data/characters'
import { loadCharacterHistory } from '@/data/characters-history'
import { useResource } from '@/data/use-resource'
import { artifactSetIcon, characterIcon, weaponIcon } from '@/lib/assets'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatStatName, formatStatValue } from '@/utils/artifact-stats'
import ArtifactPiece from './ArtifactPiece.vue'
import ConstellationPips from './ConstellationPips.vue'
import { ELEMENT_TEXT } from './tokens'

/** Everything about one character: weapon, the five pieces, set bonuses, history. */
const props = defineProps<{ character: CharacterView; account: AccountRef }>()

const c = computed(() => props.character)
const totals = computed(() => artifactTotals(c.value))

const talents = computed(() => [
  { label: 'Attack', title: 'Normal attack', value: c.value.talent.auto },
  { label: 'Skill', title: 'Elemental skill', value: c.value.talent.skill },
  { label: 'Burst', title: 'Elemental burst', value: c.value.talent.burst },
])

const history = useResource(
  () => props.account,
  (account) => loadCharacterHistory(account),
)
const changes = computed(() => history.data.value?.get(c.value.key) ?? [])
const HISTORY_PREVIEW = 6
const showAllChanges = ref(false)
const shownChanges = computed(() =>
  showAllChanges.value ? changes.value : changes.value.slice(0, HISTORY_PREVIEW),
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex items-center gap-4" aria-label="Summary">
      <GameIcon
        :src="characterIcon(c.key)"
        :name="c.name"
        :rarity="c.rarity ?? undefined"
        size="lg"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
          <RarityStars v-if="c.rarity" :rarity="c.rarity" />
          <span v-if="c.element" :class="ELEMENT_TEXT[c.element]">{{
            ELEMENT_LABELS[c.element]
          }}</span>
          <span v-if="c.weaponType">{{ WEAPON_TYPE_LABELS[c.weaponType] }}</span>
        </p>
        <p class="tabular font-mono">Lv {{ c.level }} · A{{ c.ascension }}</p>
        <ConstellationPips :value="c.constellation" :element="c.element" />
      </div>
    </section>

    <dl class="grid grid-cols-3 gap-2">
      <div
        v-for="t in talents"
        :key="t.label"
        class="flex min-w-0 flex-col gap-1 rounded-xl border border-border-default p-3"
        :title="t.title"
      >
        <dt class="text-sm text-text-secondary">{{ t.label }}</dt>
        <dd class="tabular font-mono text-2xl font-medium">{{ t.value }}</dd>
      </div>
    </dl>

    <section class="flex flex-col gap-3" aria-labelledby="detail-weapon">
      <h3 id="detail-weapon" class="font-display text-lg font-bold">Weapon</h3>
      <div
        v-if="c.weapon"
        class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-base p-3"
      >
        <GameIcon
          :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
          :name="c.weapon.name"
          :rarity="c.weapon.rarity ?? undefined"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <p class="truncate font-medium" :title="c.weapon.name">{{ c.weapon.name }}</p>
          <p class="flex flex-wrap items-center gap-x-3 text-sm">
            <span class="tabular font-mono">
              Lv {{ c.weapon.level }} · A{{ c.weapon.ascension }} · R{{ c.weapon.refinement }}
            </span>
            <RarityStars v-if="c.weapon.rarity" :rarity="c.weapon.rarity" />
            <span v-if="c.weapon.lock" class="inline-flex text-text-muted" title="Locked">
              <Lock class="size-4" aria-hidden="true" />
              <span class="sr-only">Locked</span>
            </span>
          </p>
        </div>
      </div>
      <p v-else class="text-text-muted">None</p>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="detail-artifacts">
      <div class="flex items-baseline justify-between gap-2">
        <h3 id="detail-artifacts" class="font-display text-lg font-bold">Artifacts</h3>
        <span
          v-if="c.artifactCount"
          class="tabular font-mono text-sm text-text-secondary"
          title="Crit value"
          >CV {{ c.cv.toFixed(1) }}</span
        >
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ArtifactPiece
          v-for="(slot, index) in SLOT_ORDER"
          :key="slot"
          :slot-key="slot"
          :piece="c.artifacts[index] ?? null"
        />
      </div>
    </section>

    <section v-if="c.sets.length" class="flex flex-col gap-3" aria-labelledby="detail-sets">
      <h3 id="detail-sets" class="font-display text-lg font-bold">Sets</h3>
      <ul
        class="flex flex-col divide-y divide-border-subtle rounded-xl border border-border-subtle"
      >
        <li v-for="set in c.sets" :key="set.setKey" class="flex items-center gap-3 p-3">
          <GameIcon :src="artifactSetIcon(set.setKey)" :name="set.name" size="sm" />
          <span class="min-w-0 flex-1 truncate" :title="set.name">{{ set.name }}</span>
          <span class="tabular font-mono text-text-secondary" :title="`${set.count} equipped`"
            >×{{ set.count }}</span
          >
          <ul class="flex gap-1" aria-label="Bonuses">
            <li
              v-for="t in set.thresholds"
              :key="t"
              class="tabular rounded-sm border px-1.5 font-mono text-sm leading-6"
              :class="
                set.active.includes(t)
                  ? 'border-border-strong text-success-text'
                  : 'border-border-subtle text-text-muted'
              "
              :title="`${t}-piece bonus ${set.active.includes(t) ? 'active' : 'inactive'}`"
            >
              {{ t }}pc
              <span class="sr-only">{{ set.active.includes(t) ? 'active' : 'inactive' }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-if="totals.length" class="flex flex-col gap-3" aria-labelledby="detail-totals">
      <h3
        id="detail-totals"
        class="font-display text-lg font-bold"
        title="Artifact main stats and substats, summed"
      >
        Stats
      </h3>
      <dl class="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <div
          v-for="stat in totals"
          :key="stat.key"
          class="flex items-baseline justify-between gap-2 border-b border-border-subtle py-1"
        >
          <dt class="text-text-secondary">{{ formatStatName(stat.key) }}</dt>
          <dd class="tabular font-mono">{{ formatStatValue(stat.key, stat.value) }}</dd>
        </div>
      </dl>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="detail-changes">
      <h3 id="detail-changes" class="font-display text-lg font-bold">History</h3>

      <UiError
        v-if="history.error.value"
        :error="history.error.value"
        title="Load failed"
        @retry="history.reload"
      />
      <div v-else-if="!history.data.value" class="flex flex-col gap-2" aria-busy="true">
        <UiSkeleton v-for="n in 3" :key="n" class="h-12 w-full" />
      </div>
      <p v-else-if="changes.length === 0" class="text-text-muted">None</p>
      <template v-else>
        <ol
          class="flex flex-col divide-y divide-border-subtle rounded-xl border border-border-subtle"
        >
          <li
            v-for="(change, index) in shownChanges"
            :key="`${change.at}-${index}`"
            class="flex flex-col gap-1 p-3 sm:flex-row sm:gap-4"
          >
            <time
              class="shrink-0 text-sm text-text-secondary sm:w-32"
              :datetime="new Date(change.at).toISOString()"
              :title="formatDateTime(change.at)"
              >{{ formatDate(change.at) }}</time
            >
            <div class="min-w-0 flex-1 text-sm">
              <p v-if="change.kind !== 'changed'" class="flex flex-wrap gap-x-2">
                <span class="text-text-secondary">{{
                  change.kind === 'first' ? 'First seen' : 'Obtained'
                }}</span>
                <span class="tabular font-mono">{{ change.state }}</span>
              </p>
              <ul v-else class="flex flex-col gap-1">
                <li
                  v-for="line in change.lines"
                  :key="line.label"
                  class="flex flex-wrap items-center gap-x-2"
                >
                  <span class="text-text-secondary">{{ line.label }}</span>
                  <span class="tabular font-mono">{{ line.from }}</span>
                  <ArrowRight class="size-4 text-text-muted" aria-hidden="true" />
                  <span class="sr-only">to</span>
                  <span class="tabular font-mono font-medium">{{ line.to }}</span>
                </li>
              </ul>
            </div>
          </li>
        </ol>
        <div v-if="changes.length > HISTORY_PREVIEW">
          <UiButton variant="ghost" @click="showAllChanges = !showAllChanges">
            {{ showAllChanges ? 'Show less' : `Show all (${changes.length})` }}
          </UiButton>
        </div>
      </template>
    </section>
  </div>
</template>
