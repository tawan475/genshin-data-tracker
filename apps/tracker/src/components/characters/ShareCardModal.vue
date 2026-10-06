<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { Check, Copy, Download, Moon, Share2, Sun, TriangleAlert } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { buildPanel, talentLevels } from '@/data/character-build'
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
import ShareCard from './ShareCard.vue'
import { useConstellationBoosts } from './use-boosts'

/**
 * "Share card": the build as one 1920×1080 PNG (ShareCard, drawn at
 * 1280×720 and exported at 1.5×). Preview, then download, copy or the
 * system share sheet. Name on, UID off by default (privacy); the card's
 * theme starts as the page's. Choices are remembered on this device.
 */
const props = defineProps<{
  open: boolean
  character: CharacterView | null
  account: { name: string | null; uid: string | null }
  ar: number | null
  takenAt: number | null
}>()
const emit = defineEmits<{ close: [] }>()

const WIDTH = 1280
const HEIGHT = 720
const SCALE = 1.5

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
const boosts = useConstellationBoosts(() => c.value?.key ?? '')
const talents = computed(() =>
  c.value ? talentLevels(c.value.talent, c.value.constellation, boosts.value) : [],
)
const panel = computed(() => (c.value ? buildPanel(c.value) : null))
const owner = computed(() => ({
  name: showName.value ? props.account.name : null,
  uid: showUid.value ? props.account.uid : null,
  ar: props.ar,
}))

const frame = useTemplateRef<HTMLElement>('frame')
const card = useTemplateRef<HTMLElement>('card')
const { width: frameWidth } = useElementSize(frame)
const scale = computed(() => (frameWidth.value ? frameWidth.value / WIDTH : 0))

const themes = [
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'light' as const, label: 'Light', icon: Sun },
]

// ------------------------------------------------------------------ export
// The PNG is drawn in the background once the card's images have loaded and
// the options settle, so Download / Copy / Share answer at once (the share
// sheet and Safari's clipboard need the click to still be current).

const rendering = ref(false)
const failed = ref(false)
const missing = ref(0)
const result = shallowRef<Promise<Blob> | null>(null)
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined

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
    await nextTick()
    const node = card.value?.firstElementChild as HTMLElement | null | undefined
    if (!node) throw new Error('No card')
    await imagesLoaded(node)
    const { blob, missing: lost } = await renderPng(node, {
      width: WIDTH,
      height: HEIGHT,
      scale: SCALE,
    })
    if (id === generation) missing.value = lost
    return blob
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

function schedule() {
  clearTimeout(timer)
  result.value = null
  if (!props.open || !c.value) return
  timer = setTimeout(() => (result.value = render()), 400)
}
watch(
  () => [props.open, c.value?.key, theme.value, owner.value, talents.value] as const,
  schedule,
  { immediate: true },
)

/** The ready PNG, or one drawn now. */
function png(): Promise<Blob> {
  if (!result.value) {
    clearTimeout(timer)
    result.value = render()
  }
  return result.value
}

const filename = computed(() => `${c.value?.key ?? 'character'}-genshin-tracker.png`)

async function download() {
  try {
    downloadBlob(await png(), filename.value)
  } catch {
    // "Export failed" is shown.
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

watch(
  () => props.open,
  (open) => {
    if (!open) {
      clearTimeout(timer)
      generation++
      result.value = null
      copied.value = false
      copyFailed.value = false
    }
  },
)
</script>

<template>
  <UiModal
    :open="open && character !== null"
    :title="`${character?.name ?? ''} · Card`"
    size="wide"
    @close="emit('close')"
  >
    <div v-if="character && open" class="flex flex-col gap-4">
      <div
        ref="frame"
        class="relative aspect-video w-full overflow-hidden rounded-lg border border-border-default bg-surface-sunken"
      >
        <div
          ref="card"
          class="absolute top-0 left-0 origin-top-left"
          :style="{ transform: `scale(${scale})`, width: `${WIDTH}px`, height: `${HEIGHT}px` }"
          aria-hidden="true"
        >
          <ShareCard
            :character="character"
            :panel="panel"
            :talents="talents"
            :theme="theme"
            :owner="owner"
            :taken-at="takenAt"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <UiSegmented v-model="theme" :options="themes" label="Card theme" />
        <UiSwitch v-model="showName" label="Name" class="min-w-32" />
        <UiSwitch v-model="showUid" label="UID" class="min-w-32" />
      </div>
    </div>

    <template #footer>
      <p
        class="mr-auto flex min-h-8 items-center gap-1.5 text-sm"
        :class="failed || copyFailed ? 'text-danger-text' : 'text-text-muted'"
        aria-live="polite"
      >
        <template v-if="rendering"
          ><UiSpinner class="size-4" /><span class="sr-only">Drawing</span></template
        >
        <template v-else-if="failed">Export failed</template>
        <template v-else-if="copyFailed">Copy failed</template>
        <span
          v-else-if="missing"
          class="inline-flex items-center gap-1 text-warning-text"
          :title="`${missing} image${missing > 1 ? 's' : ''} could not be loaded`"
          ><TriangleAlert class="size-4" aria-hidden="true" />{{ missing }}</span
        >
        <span v-else class="tabular font-mono" title="PNG size">1920 × 1080</span>
      </p>
      <UiButton v-if="shareable" @click="share">
        <Share2 class="size-4" aria-hidden="true" />
        Share
      </UiButton>
      <UiButton v-if="copyable" @click="copy">
        <component :is="copied ? Check : Copy" class="size-4" aria-hidden="true" />
        {{ copied ? 'Copied' : 'Copy' }}
      </UiButton>
      <UiButton variant="primary" @click="download">
        <Download class="size-4" aria-hidden="true" />
        PNG
      </UiButton>
    </template>
  </UiModal>
</template>
