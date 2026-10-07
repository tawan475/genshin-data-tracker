<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { Check, Copy, Download, Share2, TriangleAlert } from 'lucide-vue-next'
import type { AccountResponse } from '@gdt/shared'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { buildPanel, shareUid, talentLevels } from '@/data/character-build'
import { useFavoriteCharacters } from '@/data/favorite-characters'
import type { CharacterView } from '@/data/characters'
import {
  canCopyImage,
  canShareFiles,
  copyPng,
  downloadBlob,
  renderPng,
  sharePng,
} from '@/lib/share-image'
import { openExportFrame, type ExportFrame } from '@/lib/export-frame'
import { readJson, writeJson } from '@/lib/storage'
import { resolvedTheme } from '@/lib/theme'
import CardOptions from './CardOptions.vue'
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
// Drawn on demand and kept until something on the card changes. Pointing
// at the actions (or opening the phone menu) starts it silently, so the
// click that follows answers at once: the share sheet and Safari's
// clipboard need the click to still be current. Nothing in the header
// moves: a click still waiting shows a spinner in place of its own icon,
// a result swaps the icon too (a check, or a warning with the reason in
// the tooltip).

type Action = 'png' | 'copy' | 'share'

const exportCard = useTemplateRef<InstanceType<typeof ShareCard>>('exportCard')
/** The hidden iframe the export draws in; opened on first use, closed with the dialog. */
const frame = shallowRef<ExportFrame | null>(null)
let opening: Promise<ExportFrame> | null = null
const result = shallowRef<Promise<Blob> | null>(null)
/** The drawn PNG is ready (no wait on a click). */
const ready = ref(false)
const missing = ref(0)
/** The action whose click is waiting for the PNG or the clipboard. */
const waiting = ref<Action | null>(null)
/** Briefly, the action that just succeeded. */
const done = ref<Action | null>(null)
/** The last action that failed, with why. */
const failure = ref<{ action: Action; text: string } | null>(null)
let generation = 0
let doneTimer: ReturnType<typeof setTimeout> | undefined

/** What the PNG depends on; a change drops the drawn one. */
const cardState = computed(() => [c.value, theme.value, owner.value, boosts.value])
watch(cardState, () => {
  generation++
  result.value = null
  ready.value = false
  missing.value = 0
  failure.value = null
})

async function imagesLoaded(root: HTMLElement): Promise<void> {
  await Promise.all(
    [...root.querySelectorAll('img')].map((img) =>
      img.complete ? undefined : img.decode().catch(() => undefined),
    ),
  )
}

function ensureFrame(): Promise<ExportFrame> {
  if (frame.value) return Promise.resolve(frame.value)
  opening ??= openExportFrame(CARD_WIDTH, CARD_HEIGHT).then((opened) => {
    opening = null
    if (c.value === null) {
      opened.destroy() // the dialog closed meanwhile
      throw new Error('Closed')
    }
    frame.value = opened
    return opened
  })
  return opening
}

function closeFrame() {
  frame.value?.destroy()
  frame.value = null
}

function render(): Promise<Blob> {
  const id = ++generation
  const promise = (async () => {
    const target = await ensureFrame()
    await target.sync()
    await nextTick()
    const node = exportCard.value?.$el as HTMLElement | undefined
    if (!node) throw new Error('No card')
    await imagesLoaded(node)
    await target.fontsReady()
    const drawn = await renderPng(node, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      scale: CARD_SCALE,
    })
    if (id === generation) {
      missing.value = drawn.missing
      ready.value = true
    }
    return drawn.blob
  })()
  promise.catch(() => {
    if (id === generation) result.value = null // the next click tries again
  })
  return promise
}

/** The drawn PNG, or one drawn now. */
function png(): Promise<Blob> {
  result.value ??= render()
  return result.value
}

function warm() {
  if (c.value && !result.value) void png().catch(() => undefined)
}

/** Runs a click's action: a spinner in its own icon while it waits, then a check or a warning. */
async function run(action: Action, task: () => Promise<void>, failed: string) {
  if (waiting.value) return
  failure.value = null
  done.value = null
  if (!ready.value) waiting.value = action
  try {
    await task()
    done.value = action
    clearTimeout(doneTimer)
    doneTimer = setTimeout(() => (done.value = null), 2000)
  } catch (error) {
    // A dismissed share sheet is no failure.
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      failure.value = { action, text: failed }
    }
  } finally {
    waiting.value = null
  }
}

const filename = computed(() => `${c.value?.key ?? 'character'}-genshin-tracker.png`)

const shareable = canShareFiles()
const copyable = canCopyImage()

function download() {
  void run('png', async () => downloadBlob(await png(), filename.value), 'Export failed')
}
function copy() {
  // The clipboard item is made in the click, with the PNG still on its way (Safari).
  void run('copy', () => copyPng(png()), 'Copy failed')
}
function share() {
  void run(
    'share',
    async () => sharePng(await png(), filename.value, c.value?.name ?? 'Build'),
    'Share failed',
  )
}

const ICONS = { png: Download, copy: Copy, share: Share2 } as const
const LABELS = { png: 'Download 1920 × 1080 PNG', copy: 'Copy image', share: 'Share' } as const

/** An action's icon and tooltip now: idle, waiting, done, failed, or done with images missing. */
function actionState(action: Action) {
  const missed = missing.value
    ? `${missing.value} image${missing.value > 1 ? 's' : ''} could not be loaded`
    : ''
  if (waiting.value === action)
    return { icon: null, tone: '', title: `${LABELS[action]} · drawing` }
  if (failure.value?.action === action) {
    return { icon: TriangleAlert, tone: 'text-danger-text', title: failure.value.text }
  }
  if (done.value === action) {
    return missed
      ? { icon: TriangleAlert, tone: 'text-warning-text', title: missed }
      : { icon: Check, tone: '', title: action === 'copy' ? 'Copied' : LABELS[action] }
  }
  return { icon: ICONS[action], tone: '', title: LABELS[action] }
}

// Narrow screens: one header button opens the options and the actions.
const menuAnchor = useTemplateRef<HTMLElement>('menuAnchor')
const menu = ref(false)
function openMenu() {
  menu.value = true
  warm()
}

watch(
  () => c.value === null,
  (closed) => {
    if (!closed) return
    menu.value = false
    closeFrame()
    done.value = null
    failure.value = null
  },
)
onBeforeUnmount(closeFrame)
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
      <div
        v-if="showcase"
        class="flex shrink-0 items-center gap-1.5"
        @pointerenter="warm"
        @focusin="warm"
      >
        <CardOptions v-model:theme="theme" v-model:name="showName" v-model:uid="showUid" compact />
        <span class="mx-1 h-6 w-px bg-border-default" aria-hidden="true" />
        <UiIconButton
          v-for="action in [shareable ? 'share' : null, copyable ? 'copy' : null].filter(
            Boolean,
          ) as Action[]"
          :key="action"
          :label="actionState(action).title"
          @click="action === 'share' ? share() : copy()"
        >
          <UiSpinner v-if="!actionState(action).icon" class="size-5" />
          <component
            :is="actionState(action).icon"
            v-else
            class="size-5"
            :class="actionState(action).tone"
            aria-hidden="true"
          />
        </UiIconButton>
        <UiButton
          size="sm"
          variant="primary"
          class="w-[104px]"
          :title="actionState('png').title"
          @click="download"
        >
          <UiSpinner v-if="!actionState('png').icon" class="size-4" />
          <component
            :is="actionState('png').icon"
            v-else
            class="size-4"
            :class="actionState('png').tone"
            aria-hidden="true"
          />
          PNG
        </UiButton>
      </div>
      <span v-else ref="menuAnchor" class="inline-flex shrink-0">
        <UiIconButton label="Share card" :active="menu" @click="openMenu">
          <Share2 class="size-5" aria-hidden="true" />
        </UiIconButton>
      </span>
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

    <UiPopover
      v-if="!showcase"
      :open="menu"
      :anchor="menuAnchor"
      label="Share card"
      :focus="false"
      @close="menu = false"
    >
      <div class="flex flex-col gap-4 p-4">
        <CardOptions v-model:theme="theme" v-model:name="showName" v-model:uid="showUid" />
        <p
          class="flex h-5 items-center gap-1.5 text-sm"
          :class="failure ? 'text-danger-text' : missing ? 'text-warning-text' : 'text-text-muted'"
          aria-live="polite"
        >
          <template v-if="waiting">Drawing</template>
          <template v-else-if="failure">{{ failure.text }}</template>
          <template v-else-if="missing">{{ actionState('png').title }}</template>
          <span v-else class="tabular font-mono">1920 × 1080 PNG</span>
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UiButton v-if="shareable" class="col-span-2" variant="primary" @click="share">
            <UiSpinner v-if="!actionState('share').icon" class="size-4" />
            <component :is="actionState('share').icon" v-else class="size-4" aria-hidden="true" />
            Share
          </UiButton>
          <UiButton v-if="copyable" @click="copy">
            <UiSpinner v-if="!actionState('copy').icon" class="size-4" />
            <component :is="actionState('copy').icon" v-else class="size-4" aria-hidden="true" />
            Copy
          </UiButton>
          <UiButton
            :variant="shareable ? 'secondary' : 'primary'"
            :class="copyable ? '' : 'col-span-2'"
            @click="download"
          >
            <UiSpinner v-if="!actionState('png').icon" class="size-4" />
            <component :is="actionState('png').icon" v-else class="size-4" aria-hidden="true" />
            PNG
          </UiButton>
        </div>
      </div>
    </UiPopover>
  </UiModal>
</template>
