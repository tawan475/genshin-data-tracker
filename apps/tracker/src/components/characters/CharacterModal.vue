<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { Check, Copy, Download, Share2, TriangleAlert } from 'lucide-vue-next'
import type { AccountResponse } from '@gdt/shared'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { shareUid } from '@/data/character-build'
import type { CharacterView } from '@/data/characters'
import {
  canCopyImage,
  canShareFiles,
  copyPng,
  downloadBlob,
  renderPng,
  sharePng,
} from '@/lib/share-image'
import { readJson, writeJson } from '@/lib/storage'
import { resolvedTheme } from '@/lib/theme'
import CardOptions from './CardOptions.vue'
import CharacterDetail from './CharacterDetail.vue'
import { CARD_HEIGHT, CARD_SCALE, CARD_WIDTH, type CardOwner } from './share-card'
import { useConstellationBoosts } from './use-boosts'

/**
 * The character details dialog, which is also the share card. From `lg`
 * the details are the card itself (CharacterDetail `showcase`), and the
 * header carries its options (theme, name, UID) and PNG / Copy / Share; on
 * narrower screens the details stack and one header button opens the same
 * options and actions, the card being laid out off screen to export.
 * The PNG is the card at 1920×1080 (lib/share-image). Options are
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

// ------------------------------------------------------------------ export
// Drawn on demand and kept until something on the card changes. Pointing
// at the actions (or opening the phone menu) starts it, so the click that
// follows answers at once: the share sheet and Safari's clipboard need the
// click to still be current.

const detail = useTemplateRef<InstanceType<typeof CharacterDetail>>('detail')
const offscreen = ref(false)
const rendering = ref(false)
const failed = ref(false)
const missing = ref(0)
const result = shallowRef<Promise<Blob> | null>(null)
let generation = 0

/** What the PNG depends on; a change drops the drawn one. */
const cardState = computed(() => [c.value, theme.value, owner.value, boosts.value, showcase.value])
watch(cardState, () => {
  generation++
  result.value = null
  rendering.value = false
  failed.value = false
  missing.value = 0
})

async function imagesLoaded(root: HTMLElement): Promise<void> {
  await Promise.all(
    [...root.querySelectorAll('img')].map((img) =>
      img.complete ? undefined : img.decode().catch(() => undefined),
    ),
  )
}

function render(): Promise<Blob> {
  const id = ++generation
  rendering.value = true
  failed.value = false
  const promise = (async () => {
    if (!showcase.value) offscreen.value = true
    await nextTick()
    const node = detail.value?.cardElement()
    if (!node) throw new Error('No card')
    await imagesLoaded(node)
    const drawn = await renderPng(node, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      scale: CARD_SCALE,
    })
    if (id === generation) missing.value = drawn.missing
    return drawn.blob
  })()
  promise
    .catch(() => {
      if (id !== generation) return
      failed.value = true
      result.value = null // the next click tries again
    })
    .finally(() => {
      if (id === generation) rendering.value = false
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

const filename = computed(() => `${c.value?.key ?? 'character'}-genshin-tracker.png`)

async function download() {
  try {
    downloadBlob(await png(), filename.value)
  } catch {
    // Shown as "Export failed".
  }
}

const copied = ref(false)
const copyFailed = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function copy() {
  copyFailed.value = false
  copyPng(png())
    .then(() => {
      copied.value = true
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied.value = false), 2000)
    })
    .catch(() => (copyFailed.value = true))
}

const shareable = canShareFiles()
const copyable = canCopyImage()
async function share() {
  try {
    await sharePng(await png(), filename.value, c.value?.name ?? 'Build')
  } catch {
    // Dismissed, the sheet refused, or the export failed (shown).
  }
}

const status = computed(() =>
  failed.value
    ? { tone: 'danger', text: 'Export failed' }
    : copyFailed.value
      ? { tone: 'danger', text: 'Copy failed' }
      : missing.value
        ? {
            tone: 'warning',
            text: `${missing.value} image${missing.value > 1 ? 's' : ''} could not be loaded`,
          }
        : null,
)

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
    offscreen.value = false
    copied.value = false
    copyFailed.value = false
  },
)
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
      <h2 class="mr-auto min-w-0 flex-1 truncate text-lg font-semibold">
        {{ character?.name ?? '' }}
      </h2>
      <div
        v-if="showcase"
        class="flex shrink-0 items-center gap-1.5"
        @pointerenter="warm"
        @focusin="warm"
      >
        <CardOptions v-model:theme="theme" v-model:name="showName" v-model:uid="showUid" compact />
        <span class="mx-1 h-6 w-px bg-border-default" aria-hidden="true" />
        <span
          v-if="rendering"
          class="inline-flex size-6 items-center justify-center"
          title="Drawing the PNG"
        >
          <UiSpinner class="size-4" />
          <span class="sr-only">Drawing</span>
        </span>
        <span
          v-else-if="status"
          class="inline-flex"
          :class="status.tone === 'danger' ? 'text-danger-text' : 'text-warning-text'"
          :title="status.text"
          role="status"
        >
          <TriangleAlert class="size-4" aria-hidden="true" />
          <span class="sr-only">{{ status.text }}</span>
        </span>
        <UiIconButton v-if="shareable" label="Share" @click="share">
          <Share2 class="size-5" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton v-if="copyable" :label="copied ? 'Copied' : 'Copy image'" @click="copy">
          <component :is="copied ? Check : Copy" class="size-5" aria-hidden="true" />
        </UiIconButton>
        <UiButton size="sm" variant="primary" title="Download 1920 × 1080 PNG" @click="download">
          <Download class="size-4" aria-hidden="true" />
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
      ref="detail"
      :character="character"
      :account="account"
      :showcase="showcase"
      :offscreen="offscreen"
      :card-theme="theme"
      :owner="owner"
      :taken-at="takenAt"
    />

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
          class="flex min-h-5 items-center gap-1.5 text-sm"
          :class="
            status?.tone === 'danger'
              ? 'text-danger-text'
              : status
                ? 'text-warning-text'
                : 'text-text-muted'
          "
          aria-live="polite"
        >
          <template v-if="rendering"><UiSpinner class="size-4" /> Drawing</template>
          <template v-else-if="status">{{ status.text }}</template>
          <span v-else class="tabular font-mono">1920 × 1080 PNG</span>
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UiButton v-if="shareable" class="col-span-2" variant="primary" @click="share">
            <Share2 class="size-4" aria-hidden="true" />
            Share
          </UiButton>
          <UiButton v-if="copyable" @click="copy">
            <component :is="copied ? Check : Copy" class="size-4" aria-hidden="true" />
            {{ copied ? 'Copied' : 'Copy' }}
          </UiButton>
          <UiButton
            :variant="shareable ? 'secondary' : 'primary'"
            :class="copyable ? '' : 'col-span-2'"
            @click="download"
          >
            <Download class="size-4" aria-hidden="true" />
            PNG
          </UiButton>
        </div>
      </div>
    </UiPopover>
  </UiModal>
</template>
