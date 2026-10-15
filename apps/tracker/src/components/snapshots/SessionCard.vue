<script setup lang="ts">
import { decodeCharacters, type GoodCharacter, type KeyRef } from '@gdt/shared'
import { computed } from 'vue'
import ChangeValue from '@/components/overview/ChangeValue.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import { loadBundle, loadLatestInventory, type AccountRef } from '@/data/account-data'
import { characterChanges, type CharacterChange, type Session } from '@/data/sessions'
import { useResource } from '@/data/use-resource'
import { t } from '@/i18n'
import { characterName } from '@/i18n/game-names'
import { formatDate, formatDateTime, formatTime, sameDay } from '@/lib/format'

/**
 * One play session (live sync): when, how long, what it brought, what moved
 * on the roster, and one row per world stay.
 */
const props = defineProps<{
  session: Session
  account: AccountRef & { latest: { id: number } | null }
}>()

/** How many roster changes are named before "+N more". */
const SHOWN_CHANGES = 6

const when = computed(() => {
  const { start, end } = props.session
  const range = sameDay(start, end)
    ? `${formatTime(start)}–${formatTime(end)}`
    : `${formatTime(start)}–${formatDateTime(end)}`
  return {
    day: formatDate(start),
    range,
    title: `${formatDateTime(start)} – ${formatDateTime(end)}`,
  }
})

const duration = computed(() => {
  const minutes = Math.max(0, Math.round((props.session.end - props.session.start) / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0
    ? t('live.session.hours', { h: hours, m: minutes % 60 })
    : t('live.session.minutes', { m: minutes })
})

/** The roster at the session's start and end: its first and last snapshots (now, when live). */
const roster = useResource(
  () => [props.session, props.account] as const,
  async ([session, account]): Promise<CharacterChange[]> => {
    const first = session.snapshots[0]!
    const last = session.snapshots.at(-1)!
    if (first.id === last.id && !session.live) return []
    const ids = first.id === last.id ? [first.id] : [first.id, last.id]
    const bundle = await loadBundle(account, { ids, sections: ['characters'] })
    const rosterOf = (id: number): GoodCharacter[] | null => {
      const key = bundle.snapshots.find((s) => s.id === id)?.characters
      const text = key ? bundle.texts.get(key) : undefined
      return text ? decodeCharacters(JSON.parse(text) as KeyRef[][]) : null
    }
    const before = rosterOf(first.id)
    let after = rosterOf(last.id)
    if (session.live) after = (await loadLatestInventory(account))?.good.characters ?? after
    return before && after ? characterChanges(before, after) : []
  },
)

const changes = computed(() => {
  const list = roster.data.value ?? []
  return {
    shown: list.slice(0, SHOWN_CHANGES).map((change) => ({
      key: `${change.key}:${change.field}`,
      text:
        change.field === 'new'
          ? t('live.session.newCharacter', { name: characterName(change.key) })
          : t(`live.session.field.${change.field}`, {
              name: characterName(change.key),
              from: change.from,
              to: change.to,
            }),
    })),
    more: Math.max(0, list.length - SHOWN_CHANGES),
  }
})

const stays = computed(() =>
  props.session.stays.length > 1
    ? props.session.stays.map((stay) => ({
        key: stay.start,
        label: t('live.session.world', { n: stay.world }),
        range: `${formatTime(stay.start)}–${formatTime(stay.end)}`,
        mora: stay.mora,
        artifacts: stay.artifacts,
      }))
    : [],
)
</script>

<template>
  <article class="min-w-0 rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm">
    <header class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <h3 class="font-semibold" :title="when.title">{{ when.day }}</h3>
      <span class="tabular text-text-secondary">{{ when.range }}</span>
      <span class="text-text-muted">{{ duration }}</span>
      <UiBadge v-if="session.live" tone="success" class="ms-auto">{{ $t('live.label') }}</UiBadge>
    </header>

    <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span class="text-text-secondary">
        {{ $t('overview.figure.mora') }} <ChangeValue :value="session.totals.mora" />
      </span>
      <span v-if="session.totals.primogem" class="text-text-secondary">
        {{ $t('overview.figure.primogem') }} <ChangeValue :value="session.totals.primogem" />
      </span>
      <span v-if="session.totals.artifacts" class="text-text-secondary">
        {{ $t('overview.figure.artifacts') }}
        <ChangeValue :value="session.totals.artifacts" exact />
      </span>
      <span v-if="session.totals.weapons" class="text-text-secondary">
        {{ $t('overview.figure.weapons') }} <ChangeValue :value="session.totals.weapons" exact />
      </span>
      <span v-if="session.totals.characters" class="text-text-secondary">
        {{ $t('overview.figure.characters') }}
        <ChangeValue :value="session.totals.characters" exact />
      </span>
    </p>

    <p v-if="changes.shown.length" class="mt-1 min-w-0 text-sm text-text-secondary">
      <template v-for="(change, i) in changes.shown" :key="change.key">
        <span v-if="i" class="px-1.5 text-text-muted" aria-hidden="true">·</span>
        <span>{{ change.text }}</span>
      </template>
      <span v-if="changes.more" class="ps-1.5 text-text-muted">
        {{ $t('live.session.more', { n: changes.more }) }}
      </span>
    </p>

    <ul
      v-if="stays.length"
      class="mt-3 divide-y divide-border-subtle border-t border-border-subtle"
    >
      <li
        v-for="stay in stays"
        :key="stay.key"
        class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 py-1.5 text-sm"
      >
        <span class="w-24 min-w-0 truncate">{{ stay.label }}</span>
        <span class="tabular w-32 text-text-muted">{{ stay.range }}</span>
        <span class="flex min-w-0 flex-wrap gap-x-3 text-text-secondary">
          <span>{{ $t('overview.figure.mora') }} <ChangeValue :value="stay.mora" /></span>
          <span v-if="stay.artifacts">
            {{ $t('overview.figure.artifacts') }} <ChangeValue :value="stay.artifacts" exact />
          </span>
        </span>
      </li>
    </ul>
  </article>
</template>
