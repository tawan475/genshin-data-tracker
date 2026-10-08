<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { AccountResponse } from '@gdt/shared'
import UiModal from '@/components/ui/UiModal.vue'
import { buildPanel, shareUid, talentLevels } from '@/data/character-build'
import { useFavoriteCharacters } from '@/data/favorite-characters'
import type { CharacterView } from '@/data/characters'
import { readJson, writeJson } from '@/lib/storage'
import { resolvedTheme } from '@/lib/theme'
import { useCardExport } from '@/lib/use-card-export'
import ShareActions from '@/components/share/ShareActions.vue'
import ShareMenu from '@/components/share/ShareMenu.vue'
import CharacterDetail from './CharacterDetail.vue'
import FavoriteStar from './FavoriteStar.vue'
import ShareCard from './ShareCard.vue'
import { CARD_HEIGHT, CARD_SCALE, CARD_WIDTH, type CardOwner } from './share-card'
import { useConstellationBoosts } from './use-boosts'

/**
 * The character details dialog, which is also the share card. From `lg`
 * the details are the card itself (CharacterDetail `showcase`), and the
 * header carries its options (theme, name, UID) and PNG / Copy / Share; on
 * narrower screens the details stack and one header button opens the same
 * options and actions. Every export draws its own copy of the card in a
 * hidden 1920×1080 iframe (lib/export-frame), so the PNG is the same at any
 * window size, zoom or aspect ratio; the iframe stays for the next export
 * and goes when the dialog closes. The PNG is the card at 1920×1080
 * (lib/share-image). Options are
 * remembered on this device; the UID is off until asked for (it's
 * personal) and falls back to the newest capture's when the account has
 * none.
 */
const props = defineProps<{
  character: CharacterView | null
  account: AccountResponse
  /** From the newest capture (irminsul's gi_player). */
  playerUid: number | null
  ar: number | null
  index?: number
  total: number
}>()
const emit = defineEmits<{ close: []; step: [delta: -1 | 1] }>()

const showcase = useMediaQuery('(min-width: 1024px)')

// The favourite star beside the name: the page's own list (pinned first), by GOOD key.
const { isFavorite, toggle: toggleFavorite } = useFavoriteCharacters(() => props.account.id)

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
  writeJson('share-card', { theme: theme.value, name: showName.value, uid: showUid.value }),
)

const c = computed(() => props.character)
const owner = computed<CardOwner>(() => ({
  name: showName.value ? props.account.name : null,
  uid: showUid.value ? shareUid(props.account.uid, props.playerUid) : null,
  ar: props.ar,
}))
const takenAt = computed(() => props.account.latest?.takenAt ?? null)
const boosts = useConstellationBoosts(() => c.value?.key ?? '')
const panel = computed(() => (c.value ? buildPanel(c.value) : null))
const talents = computed(() =>
  c.value ? talentLevels(c.value.talent, c.value.constellation, boosts.value) : [],
)

// ------------------------------------------------------------------ export
// Drawn on demand in its own hidden 1920×1080 frame and kept until something on
// the card changes (lib/use-card-export).

const exportCard = useTemplateRef<InstanceType<typeof ShareCard>>('exportCard')
const exporter = useCardExport({
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  scale: CARD_SCALE,
  node: () => exportCard.value?.$el as HTMLElement | undefined,
  open: () => c.value !== null,
  state: () => [c.value, theme.value, owner.value, boosts.value],
  filename: () => `${c.value?.key ?? 'character'}-genshin-tracker.png`,
  title: () => c.value?.name ?? 'Build',
  pngLabel: 'Download 1920 × 1080 PNG',
})
const frame = exporter.frame
</script>

<template>
  <UiModal
    :open="character !== null"
    :title="character?.name ?? ''"
    size="detail"
    :index="index"
    :total="total"
    loop
    @close="emit('close')"
    @step="(delta) => emit('step', delta)"
  >
    <template #heading>
      <div class="mr-auto flex min-w-0 flex-1 items-center gap-1">
        <h2 class="min-w-0 truncate text-lg font-semibold">{{ character?.name ?? '' }}</h2>
        <FavoriteStar
          v-if="character"
          :on="isFavorite(character.key)"
          :name="character.name"
          always
          @toggle="toggleFavorite(character.key)"
        />
      </div>
      <ShareActions
        v-if="showcase"
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
        size="1920 × 1080 PNG"
      />
    </template>

    <CharacterDetail
      v-if="character"
      :character="character"
      :account="account"
      :showcase="showcase"
      :card-theme="theme"
      :owner="owner"
      :taken-at="takenAt"
    />

    <!-- The card the export draws: in the hidden 1920×1080 iframe, never on the page -->
    <Teleport v-if="frame && character" :to="frame.mount">
      <ShareCard
        ref="exportCard"
        :character="character"
        :panel="panel"
        :talents="talents"
        :theme="theme"
        :owner="owner"
        :taken-at="takenAt"
        still
      />
    </Teleport>
  </UiModal>
</template>
