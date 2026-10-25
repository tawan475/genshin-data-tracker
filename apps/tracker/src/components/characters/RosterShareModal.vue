<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useElementSize, useMediaQuery } from '@vueuse/core'
import type { AccountResponse } from '@gdt/shared'
import ShareActions from '@/components/share/ShareActions.vue'
import ShareMenu from '@/components/share/ShareMenu.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { shareUid } from '@/data/character-build'
import type { CharacterView } from '@/data/characters'
import { t } from '@/i18n'
import { locale } from '@/i18n/locale'
import { readJson, writeJson } from '@/lib/storage'
import { resolvedTheme } from '@/lib/theme'
import { useCardExport } from '@/lib/use-card-export'
import RosterShareCard from './RosterShareCard.vue'
import {
  ROSTER_FRAME_HEIGHT,
  ROSTER_FRAME_WIDTH,
  ROSTER_SCALE,
  rosterColumns,
  rosterWidth,
} from './roster-card'
import type { CardOwner } from './share-card'

/**
 * The roster share card's dialog (Characters page): the card scaled to the
 * dialog's width, its options (theme, name, UID; the share card's one
 * remembered set, `share-card`) and PNG / Copy / Share in the header, like
 * the character dialog. The export draws its own copy in a hidden frame
 * (lib/use-card-export), at the card's own width and laid-out height.
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

// The preview: the card at its own size, scaled to the dialog's width.
const box = useTemplateRef<HTMLElement>('box')
const preview = useTemplateRef<InstanceType<typeof RosterShareCard>>('preview')
const { width: boxWidth } = useElementSize(box)
// Border box: the card's padding is on its root. A transform doesn't change it.
const { height: cardHeight } = useElementSize(
  computed(() => preview.value?.$el as HTMLElement | undefined),
  undefined,
  { box: 'border-box' },
)
const scale = computed(() =>
  boxWidth.value > 0 ? Math.min(1, boxWidth.value / cardWidth.value) : 0,
)

const exportCard = useTemplateRef<InstanceType<typeof RosterShareCard>>('exportCard')
const exporter = useCardExport({
  width: ROSTER_FRAME_WIDTH,
  height: ROSTER_FRAME_HEIGHT,
  scale: ROSTER_SCALE,
  measure: (node) => ({ width: node.offsetWidth, height: Math.ceil(node.offsetHeight) }),
  node: () => exportCard.value?.$el as HTMLElement | undefined,
  open: () => props.open,
  state: () => [props.characters, theme.value, owner.value, locale.value],
  filename: () => 'characters-genshin-tracker.png',
  title: () => t('game.characters'),
  pngLabel: () => t('share.export.download'),
})
const frame = exporter.frame
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

    <!-- The card as the PNG draws it, scaled to fit -->
    <div ref="box" class="w-full overflow-hidden rounded-xl">
      <div :style="{ height: `${cardHeight * scale}px` }">
        <RosterShareCard
          v-if="open"
          ref="preview"
          class="origin-top-left"
          :style="{ transform: `scale(${scale})` }"
          :characters="characters"
          :theme="theme"
          :owner="owner"
          :taken-at="takenAt"
        />
      </div>
    </div>

    <!-- The picture the export draws: in a hidden fixed-size iframe, never on the page -->
    <Teleport v-if="frame && open" :to="frame.mount">
      <RosterShareCard
        ref="exportCard"
        :characters="characters"
        :theme="theme"
        :owner="owner"
        :taken-at="takenAt"
        still
      />
    </Teleport>
  </UiModal>
</template>
