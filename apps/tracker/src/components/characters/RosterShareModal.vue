<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { AccountResponse } from '@gdt/shared'
import ShareActions from '@/components/share/ShareActions.vue'
import ShareMenu from '@/components/share/ShareMenu.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { shareUid, talentLevels } from '@/data/character-build'
import type { CharacterView } from '@/data/characters'
import { t } from '@/i18n'
import { locale } from '@/i18n/locale'
import { formatDate } from '@/lib/format'
import { readJson, writeJson } from '@/lib/storage'
import { resolvedTheme } from '@/lib/theme'
import { useCardExport } from '@/lib/use-card-export'
import { ROSTER_SCALE, rosterColumns, rosterWidth } from './roster-card'
import { drawRoster, rosterPng, type DrawnRoster } from './roster-canvas'
import type { CardOwner } from './share-card'
import { useConstellationBoostTable } from './use-boosts'

/**
 * The roster share card's dialog (Characters page): the card, its options
 * (theme, name, UID; the share card's one remembered set, `share-card`) and
 * PNG / Copy / Share in the header, like the character dialog. The card is
 * drawn on a canvas (roster-canvas) once per change and the preview is that
 * canvas; the PNG is encoded from it only when an export asks (pointing at
 * the actions warms it): encoding ~6 million pixels takes about a second.
 */
const props = defineProps<{
  open: boolean
  /** The roster as the page lists it (filters and sort). */
  characters: readonly CharacterView[]
  account: AccountResponse
  playerUid: number | null
  ar: number | null
}>()
defineEmits<{ close: [] }>()

const wide = useMediaQuery('(min-width: 1024px)')

interface Prefs {
  theme?: 'light' | 'dark'
  name?: boolean
  uid?: boolean
}
const saved = readJson<Prefs>('share-card', {})
const theme = ref<'light' | 'dark'>(saved.theme ?? resolvedTheme.value)
const showName = ref(saved.name ?? true)
const showUid = ref(saved.uid ?? false)
watch([theme, showName, showUid], () =>
  writeJson('share-card', {
    ...readJson<object>('share-card', {}),
    theme: theme.value,
    name: showName.value,
    uid: showUid.value,
  }),
)

const owner = computed<CardOwner>(() => ({
  name: showName.value ? props.account.name : null,
  uid: showUid.value ? shareUid(props.account.uid, props.playerUid) : null,
  ar: showName.value ? props.ar : null,
}))
const takenAt = computed(() => props.account.latest?.takenAt ?? null)
const cardWidth = computed(() => rosterWidth(rosterColumns(props.characters.length)))

// Talents as the game shows them: C3/C5 boosts included (base levels until the data loads).
const boostTable = useConstellationBoostTable()

/** One drawing per change while open: the preview's canvas, and its PNG once asked for. */
interface Drawing {
  drawn: DrawnRoster
  png: Promise<Blob> | null
}
const drawing = shallowRef<Promise<Drawing> | null>(null)
const shown = shallowRef<DrawnRoster | null>(null)
const host = useTemplateRef<HTMLElement>('host')
watch([shown, host], ([drawn, el]) => {
  if (!el || !drawn) return
  drawn.canvas.className = 'block h-auto w-full'
  drawn.canvas.setAttribute('role', 'img')
  drawn.canvas.setAttribute('aria-label', t('characters.roster.title'))
  el.replaceChildren(drawn.canvas)
})

function redraw() {
  if (!props.open) return
  const boosts = boostTable.value
  const promise = (async (): Promise<Drawing> => {
    const drawn = await drawRoster(
      {
        characters: props.characters,
        talents: new Map(
          props.characters.map((c) => [
            c.key,
            talentLevels(c.talent, c.constellation, boosts?.(c.key) ?? null),
          ]),
        ),
        theme: theme.value,
        owner: owner.value,
        date: takenAt.value ? formatDate(takenAt.value) : null,
        labels: {
          title: t('game.characters'),
          c6: t('characters.page.c6'),
          level90: t('characters.page.level90'),
        },
      },
      ROSTER_SCALE,
    )
    return { drawn, png: null }
  })()
  drawing.value = promise
  promise.then(
    (done) => {
      if (drawing.value === promise) shown.value = done.drawn
    },
    () => undefined,
  )
}
watch(
  () => [props.open, props.characters, theme.value, owner.value, locale.value, boostTable.value],
  redraw,
  { immediate: true },
)

const exporter = useCardExport({
  draw: async () => {
    if (!drawing.value) redraw()
    if (!drawing.value) throw new Error('Closed')
    const done = await drawing.value
    done.png ??= rosterPng(done.drawn)
    return { blob: await done.png, missing: done.drawn.missing }
  },
  open: () => props.open,
  state: () => [props.characters, theme.value, owner.value, locale.value, boostTable.value],
  filename: () => 'characters-teyvat-me.png',
  title: () => t('game.characters'),
  pngLabel: () => t('share.export.download'),
})
const pngSize = computed(() =>
  t('characters.modal.pngSize', { size: `${Math.round(cardWidth.value * ROSTER_SCALE)} px` }),
)
</script>

<template>
  <UiModal :open="open" :title="$t('characters.roster.title')" size="wide" @close="$emit('close')">
    <template #heading>
      <h2 class="mr-auto min-w-0 flex-1 truncate text-lg font-semibold">
        {{ $t('characters.roster.title') }}
      </h2>
      <ShareActions
        v-if="wide"
        v-model:theme="theme"
        v-model:name="showName"
        v-model:uid="showUid"
        :exporter="exporter"
      />
      <ShareMenu
        v-else
        v-model:theme="theme"
        v-model:name="showName"
        v-model:uid="showUid"
        :exporter="exporter"
        :size="pngSize"
      />
    </template>

    <!-- The card: the canvas the PNG is encoded from, scaled to fit -->
    <div v-show="shown" ref="host" class="w-full overflow-hidden rounded-xl" />
    <UiSkeleton v-if="!shown" class="aspect-[16/11] w-full rounded-xl" />
  </UiModal>
</template>
