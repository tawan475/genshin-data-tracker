<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Crown, Lock, Wrench } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import RarityStars from '@/components/ui/RarityStars.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import type { AccountRef } from '@/data/account-data'
import {
  ELEMENT_LABELS,
  SLOT_ORDER,
  TARGET_LEVEL,
  WEAPON_TYPE_LABELS,
  artifactTotals,
  type CharacterView,
} from '@/data/characters'
import { loadCharacterHistory } from '@/data/characters-history'
import { useResource } from '@/data/use-resource'
import { artifactSetIcon, characterBanner, characterIcon, weaponIcon } from '@/lib/assets'
import { formatDate, formatFullDateTime } from '@/lib/format'
import { formatStatName, formatStatValue } from '@/utils/artifact-stats'
import ArtifactPiece from './ArtifactPiece.vue'
import CharacterTimeline from './CharacterTimeline.vue'
import ConstellationPips from './ConstellationPips.vue'
import FriendshipBadge from './FriendshipBadge.vue'
import TalentGlyph from './TalentGlyph.vue'
import { constellationIcons, talentIcons } from './talent-icons'
import { ELEMENT_FILL, ELEMENT_SOFT, ELEMENT_TEXT } from './tokens'

/** Everything about one character: talents, weapon, the five pieces, sets, history. */
const props = defineProps<{ character: CharacterView; account: AccountRef }>()

const c = computed(() => props.character)
const totals = computed(() => artifactTotals(c.value))

const glyphs = computed(() => talentIcons(c.value.key))
const talents = computed(() => [
  {
    key: 'auto',
    label: 'Attack',
    title: 'Normal attack',
    value: c.value.talent.auto,
    icon: glyphs.value.auto,
  },
  {
    key: 'skill',
    label: 'Skill',
    title: 'Elemental skill',
    value: c.value.talent.skill,
    icon: glyphs.value.skill,
  },
  {
    key: 'burst',
    label: 'Burst',
    title: 'Elemental burst',
    value: c.value.talent.burst,
    icon: glyphs.value.burst,
  },
])
const constellations = computed(() => constellationIcons(c.value.key))
const hasConstellationIcons = computed(() => constellations.value.some(Boolean))

// The namecard art behind the summary; hidden if it fails.
const banner = computed(() => characterBanner(c.value.key))
const bannerFailed = ref(false)
watch(banner, () => (bannerFailed.value = false))

const glyphTone = computed(() =>
  c.value.element
    ? `${ELEMENT_SOFT[c.value.element]} ${ELEMENT_TEXT[c.value.element]}`
    : 'bg-surface-overlay text-text-secondary',
)

const history = useResource(
  () => props.account,
  (account) => loadCharacterHistory(account),
)
const changes = computed(() => history.data.value?.get(c.value.key) ?? [])

const CRIT_KEYS = new Set(['critRate_', 'critDMG_'])
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Summary -->
    <section
      class="relative overflow-hidden rounded-xl border border-border-default bg-surface-base"
      aria-label="Summary"
    >
      <img
        v-if="banner && !bannerFailed"
        :src="banner"
        alt=""
        decoding="async"
        class="pointer-events-none absolute inset-y-0 right-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_left,black_20%,transparent)] sm:w-3/4 dark:opacity-20"
        @error="bannerFailed = true"
      />
      <div class="relative flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center">
        <div class="flex min-w-0 flex-1 items-center gap-4">
          <GameIcon
            :src="characterIcon(c.key)"
            :name="c.name"
            :rarity="c.rarity ?? undefined"
            size="lg"
            class="size-20! rounded-xl! sm:size-24!"
          />
          <div class="flex min-w-0 flex-col gap-1.5">
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              <RarityStars v-if="c.rarity" :rarity="c.rarity" />
              <span v-if="c.element" class="inline-flex items-center gap-1.5">
                <span class="size-2.5 rounded-full" :class="ELEMENT_FILL[c.element]" />
                <span :class="ELEMENT_TEXT[c.element]">{{ ELEMENT_LABELS[c.element] }}</span>
              </span>
              <span v-if="c.weaponType">{{ WEAPON_TYPE_LABELS[c.weaponType] }}</span>
              <FriendshipBadge v-if="c.friendship !== null" :level="c.friendship" />
              <time
                v-if="c.obtainedAt !== null"
                :datetime="new Date(c.obtainedAt).toISOString()"
                :title="`Obtained ${formatFullDateTime(c.obtainedAt)}`"
                >Obtained {{ formatDate(c.obtainedAt) }}</time
              >
            </p>
            <p class="tabular font-mono text-2xl font-semibold" :title="`Ascension ${c.ascension}`">
              Lv
              <span :class="c.level < TARGET_LEVEL ? 'text-warning-text' : ''">{{ c.level }}</span>
              <span class="text-base font-normal text-text-muted">A{{ c.ascension }}</span>
            </p>
            <ul
              v-if="hasConstellationIcons"
              class="flex gap-1.5"
              :aria-label="`Constellation ${c.constellation} of 6`"
            >
              <li
                v-for="(icon, index) in constellations"
                :key="index"
                class="inline-flex size-7 items-center justify-center rounded-full"
                :class="
                  index < c.constellation ? glyphTone : 'bg-surface-overlay text-text-muted/50'
                "
                :title="`C${index + 1}${index < c.constellation ? '' : ' (locked)'}`"
              >
                <TalentGlyph :src="icon" class="size-5" />
              </li>
            </ul>
            <ConstellationPips v-else :value="c.constellation" :element="c.element" />
          </div>
        </div>

        <dl class="grid grid-cols-3 gap-2 md:w-80">
          <div
            v-for="t in talents"
            :key="t.key"
            class="flex min-w-0 items-center gap-2 rounded-xl border bg-surface-raised/90 p-2 sm:p-2.5"
            :class="t.value >= 10 ? 'border-rarity-5/60' : 'border-border-default'"
            :title="`${t.title} ${t.value}${t.value >= 10 ? ' (crowned)' : ''}`"
          >
            <span
              v-if="t.icon"
              class="hidden size-8 shrink-0 items-center justify-center rounded-full min-[400px]:inline-flex"
              :class="glyphTone"
            >
              <TalentGlyph :src="t.icon" class="size-6" />
            </span>
            <div class="min-w-0">
              <dt class="truncate text-xs text-text-secondary">{{ t.label }}</dt>
              <dd
                class="tabular flex items-center gap-1 font-mono text-xl leading-tight font-semibold"
                :class="t.value >= 10 ? 'text-rarity-5' : ''"
              >
                {{ t.value }}
                <Crown v-if="t.value >= 10" class="size-4" aria-label="Crowned" />
              </dd>
            </div>
          </div>
        </dl>
      </div>
      <p
        v-if="c.gaps.length"
        class="relative flex flex-wrap items-center gap-1.5 border-t border-border-default px-4 py-2 sm:px-5"
      >
        <Wrench class="size-4 text-warning-text" aria-hidden="true" />
        <span class="sr-only">To do:</span>
        <UiBadge v-for="gap in c.gaps" :key="gap.kind" tone="warning">{{ gap.text }}</UiBadge>
      </p>
    </section>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div class="flex min-w-0 flex-col gap-5">
        <section aria-labelledby="detail-weapon">
          <h3 id="detail-weapon" class="mb-2 text-sm font-semibold text-text-secondary">Weapon</h3>
          <div
            v-if="c.weapon"
            class="flex items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
          >
            <GameIcon
              :src="weaponIcon(c.weapon.key, c.weapon.ascension)"
              :name="c.weapon.name"
              :rarity="c.weapon.rarity ?? undefined"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <RouterLink
                :to="{
                  name: 'account-weapons',
                  params: { accountId: account.id },
                  query: { w: c.weapon.key },
                }"
                class="truncate font-medium hover:text-accent-text"
                :title="c.weapon.name"
                >{{ c.weapon.name }}</RouterLink
              >
              <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span
                  class="tabular font-mono"
                  :class="c.weapon.level < TARGET_LEVEL ? 'text-warning-text' : ''"
                  :title="`Ascension ${c.weapon.ascension}`"
                  >Lv {{ c.weapon.level }}</span
                >
                <span
                  class="inline-flex items-center gap-1.5"
                  :title="`Refinement ${c.weapon.refinement} of 5`"
                >
                  <span class="tabular font-mono">R{{ c.weapon.refinement }}</span>
                  <span class="inline-flex gap-0.5" aria-hidden="true">
                    <span
                      v-for="n in 5"
                      :key="n"
                      class="h-1.5 w-2.5 rounded-full"
                      :class="n <= c.weapon.refinement ? 'bg-accent' : 'bg-border-strong'"
                    />
                  </span>
                </span>
                <RarityStars v-if="c.weapon.rarity" :rarity="c.weapon.rarity" />
                <span v-if="c.weapon.lock" class="inline-flex text-text-muted" title="Locked">
                  <Lock class="size-3.5" aria-hidden="true" />
                  <span class="sr-only">Locked</span>
                </span>
              </p>
            </div>
          </div>
          <p
            v-else
            class="rounded-xl border border-dashed border-border-strong p-3 text-sm text-text-muted"
          >
            None
          </p>
        </section>

        <section v-if="c.sets.length" aria-labelledby="detail-sets">
          <h3 id="detail-sets" class="mb-2 text-sm font-semibold text-text-secondary">Sets</h3>
          <ul
            class="flex flex-col divide-y divide-border-subtle rounded-xl border border-border-default bg-surface-raised"
          >
            <li v-for="set in c.sets" :key="set.setKey" class="flex items-center gap-2.5 px-3 py-2">
              <GameIcon :src="artifactSetIcon(set.setKey)" :name="set.name" size="xs" />
              <span class="min-w-0 flex-1 truncate text-sm" :title="set.name">{{ set.name }}</span>
              <ul class="flex gap-1" aria-label="Bonuses">
                <li v-for="t in set.thresholds" :key="t" class="flex">
                  <UiBadge
                    :tone="set.active.includes(t) ? 'success' : 'neutral'"
                    mono
                    :title="`${t}-piece bonus ${set.active.includes(t) ? 'active' : 'inactive'}`"
                  >
                    {{ t }}pc
                    <span class="sr-only">{{
                      set.active.includes(t) ? 'active' : 'inactive'
                    }}</span>
                  </UiBadge>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <section v-if="totals.length" aria-labelledby="detail-totals">
          <h3
            id="detail-totals"
            class="mb-2 text-sm font-semibold text-text-secondary"
            title="Artifact main stats and substats, summed"
          >
            Artifact stats
          </h3>
          <dl
            class="grid grid-cols-1 gap-x-4 rounded-xl border border-border-default bg-surface-raised px-3 py-1.5 sm:grid-cols-2 lg:grid-cols-1"
          >
            <div
              v-for="stat in totals"
              :key="stat.key"
              class="flex items-baseline justify-between gap-2 py-1 text-sm"
            >
              <dt
                class="truncate"
                :class="CRIT_KEYS.has(stat.key) ? 'text-text-primary' : 'text-text-secondary'"
              >
                {{ formatStatName(stat.key) }}
              </dt>
              <dd class="tabular font-mono" :class="CRIT_KEYS.has(stat.key) ? 'font-semibold' : ''">
                {{ formatStatValue(stat.key, stat.value) }}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section class="min-w-0" aria-labelledby="detail-artifacts">
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h3 id="detail-artifacts" class="text-sm font-semibold text-text-secondary">Artifacts</h3>
          <p v-if="c.artifactCount" class="flex gap-3 text-sm text-text-secondary">
            <span title="CRIT Rate / CRIT DMG from artifacts"
              >Crit
              <span class="tabular font-mono text-text-primary"
                >{{ c.critRate }}% / {{ c.critDmg }}%</span
              ></span
            >
            <span title="Crit value"
              >CV
              <span class="tabular font-mono text-text-primary">{{ c.cv.toFixed(1) }}</span></span
            >
          </p>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ArtifactPiece
            v-for="(slot, index) in SLOT_ORDER"
            :key="slot"
            :slot-key="slot"
            :piece="c.artifacts[index] ?? null"
          />
        </div>
      </section>
    </div>

    <section aria-labelledby="detail-changes">
      <h3 id="detail-changes" class="mb-3 text-sm font-semibold text-text-secondary">History</h3>
      <UiError
        v-if="history.error.value"
        :error="history.error.value"
        title="Load failed"
        @retry="history.reload"
      />
      <div v-else-if="!history.data.value" class="flex flex-col gap-3" aria-busy="true">
        <UiSkeleton v-for="n in 3" :key="n" class="h-6 w-full max-w-md" />
      </div>
      <p v-else-if="changes.length === 0" class="text-sm text-text-muted">None</p>
      <CharacterTimeline v-else :changes="changes" :reset-key="c.key" />
    </section>
  </div>
</template>
