<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { Check, Copy, Link2 } from 'lucide-vue-next'
import {
  UIGF_GACHA_TYPES,
  WISH_SITE_IMPORT_MAX_RECORDS,
  newestRealId,
  parseWishLink,
  type AccountResponse,
  type WishNewest,
} from '@gdt/shared'
import { api } from '@/api'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { WishHistory } from '@/data/wish-history'
import {
  fetchWishLink,
  WishLinkError,
  type LinkProgress,
  type WishPageAnswer,
} from '@/data/wish-link-import'
import { formatNumber } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { bannerInfo } from './wish-labels'

/**
 * The traditional import, as paimon.moe's: open Wish → History in game,
 * get the page's link (on PC the tracker's PowerShell script copies it out
 * of the game's cache; irminsul's "Copy wish URL" gives the same link),
 * paste it here. The browser then pages through the wish history through
 * the tracker's proxy, banner by banner, up to the newest pull already
 * stored, and imports what is new. The link is never saved.
 */
const props = defineProps<{ account: AccountResponse; history: WishHistory | undefined }>()
const emit = defineEmits<{ changed: []; done: [] }>()
const feedback = useFeedback()

type Platform = 'pc' | 'android' | 'ios' | 'ps'
const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'pc', label: 'PC' },
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
  { value: 'ps', label: 'PlayStation' },
]
const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
const platform = ref<Platform>(
  /android/i.test(agent) ? 'android' : /iphone|ipad|ipod/i.test(agent) ? 'ios' : 'pc',
)

const command = computed(
  () =>
    `[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex (irm '${location.origin}/wish-url.ps1')`,
)
const copied = ref(false)
async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    feedback.error('Not copied: select the command and copy it')
  }
}

const STEPS: Record<Exclude<Platform, 'pc'>, string[]> = {
  android: [
    'Open Wish → History in game and let it load.',
    'Turn off Wi-Fi and mobile data.',
    'Tap refresh (top right): the page shows an error with some text.',
    'Select all of that text and copy it.',
    'Turn the connection back on, then paste it below.',
  ],
  ios: [
    'Open the Paimon menu → Feedback and let it load.',
    'Tap In-game issue → Co-Op Mode.',
    'Tap the link at the bottom of the reply: it opens in the browser.',
    'Copy that link and paste it below.',
  ],
  ps: [
    'Open the event mail with a QR code in game.',
    'Scan the code with your phone and copy the link it opens.',
    'Paste it below. If it fails, link your PlayStation to a HoYoverse account and use the PC or phone steps.',
  ],
}

const pasted = ref('')
const link = computed(() => (pasted.value.trim() ? parseWishLink(pasted.value) : null))
const invalid = computed(() => pasted.value.trim() !== '' && !link.value)

const running = ref(false)
const progress = shallowRef<LinkProgress | null>(null)
const failure = ref('')
let controller: AbortController | null = null
onBeforeUnmount(() => controller?.abort())

/** Highest game id held per banner: each banner stops there. */
const newest = computed<WishNewest>(() => {
  const out: WishNewest = { '100': null, '200': null, '301': null, '302': null, '500': null }
  for (const banner of UIGF_GACHA_TYPES) {
    const id = newestRealId(props.history?.banners.get(banner) ?? [])
    out[String(banner) as keyof WishNewest] = id === null ? null : id.toString()
  }
  return out
})

async function fetchPage(gachaType: number, page: number, endId: string): Promise<WishPageAnswer> {
  return api.fetchWishPage({ url: pasted.value, gachaType, page, endId }, controller?.signal)
}

async function start() {
  if (!link.value || running.value) return
  failure.value = ''
  running.value = true
  controller = new AbortController()
  const id = props.account.id
  try {
    const { records, uid } = await fetchWishLink({
      fetchPage,
      newest: newest.value,
      signal: controller.signal,
      onProgress: (p) => (progress.value = p),
    })
    const own = props.account.uid?.trim()
    if (uid && own && uid !== own) {
      failure.value = `That link is UID ${uid}; this account is UID ${own}.`
      return
    }
    let added = 0
    for (let i = 0; i < records.length; i += WISH_SITE_IMPORT_MAX_RECORDS) {
      const answer = await api.importWishes(id, {
        ...(uid ? { uid } : {}),
        records: records.slice(i, i + WISH_SITE_IMPORT_MAX_RECORDS),
      })
      added += answer.added
    }
    pasted.value = ''
    feedback.toast({
      tone: 'success',
      title: added > 0 ? `${formatNumber(added)} new pulls` : 'Nothing new',
    })
    if (added > 0) emit('changed')
    emit('done')
  } catch (error) {
    if (error instanceof WishLinkError && error.code === 'cancelled') return
    failure.value = error instanceof Error ? error.message : 'Import failed'
  } finally {
    running.value = false
    progress.value = null
    controller = null
  }
}

function cancel() {
  controller?.abort()
}

const progressText = computed(() => {
  const p = progress.value
  if (!p) return ''
  if (p.banner === 0) return `Saving ${formatNumber(p.found)}…`
  const name = bannerInfo(p.banner as (typeof UIGF_GACHA_TYPES)[number]).label
  return `${name} · page ${p.page} · ${formatNumber(p.found)} new`
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div role="radiogroup" aria-label="Platform" class="flex flex-wrap gap-2">
      <FilterChip
        v-for="p in PLATFORMS"
        :key="p.value"
        radio
        :pressed="platform === p.value"
        @toggle="platform = p.value"
        >{{ p.label }}</FilterChip
      >
    </div>

    <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-text-secondary">
      <template v-if="platform === 'pc'">
        <li>Open Wish → History in game and let it load.</li>
        <li>
          Open PowerShell (Start, type PowerShell) and run:
          <div class="mt-1.5 flex items-stretch gap-1">
            <pre
              class="font-code min-w-0 flex-1 rounded-lg bg-surface-sunken px-3 py-2 text-xs break-all whitespace-pre-wrap text-text-primary select-all"
              title="Reads the game's web cache on this PC, checks the link once with HoYoverse, copies it. Nothing else."
              >{{ command }}</pre
            >
            <UiButton size="sm" :title="copied ? 'Copied' : 'Copy'" @click="copyCommand">
              <Check v-if="copied" class="size-4" aria-hidden="true" />
              <Copy v-else class="size-4" aria-hidden="true" />
              <span class="sr-only">Copy</span>
            </UiButton>
          </div>
          <a
            class="mt-1 inline-block text-xs text-accent-text hover:underline"
            href="/wish-url.ps1"
            target="_blank"
            rel="noopener"
            >Read the script</a
          >
        </li>
        <li title="irminsul's Copy wish URL gives the same link">
          It copies the link: paste it below.
        </li>
      </template>
      <li v-for="step in STEPS[platform as Exclude<Platform, 'pc'>] ?? []" v-else :key="step">
        {{ step }}
      </li>
    </ol>

    <label class="flex flex-col gap-1">
      <span class="sr-only">Wish history link</span>
      <textarea
        v-model="pasted"
        rows="3"
        class="w-full resize-y rounded-md border bg-surface-raised px-3 py-2 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:opacity-60"
        :class="invalid ? 'border-danger' : 'border-border-strong'"
        placeholder="Paste the link: https://…"
        :disabled="running"
        spellcheck="false"
        autocomplete="off"
      />
    </label>
    <p v-if="invalid" class="text-sm text-danger-text" role="alert">
      No wish history link in that text
    </p>
    <p v-if="failure" class="text-sm text-danger-text" role="alert">{{ failure }}</p>
    <p v-if="running" class="tabular font-mono text-sm text-text-secondary" aria-live="polite">
      {{ progressText }}
    </p>
    <div class="flex gap-2">
      <UiButton variant="primary" :disabled="!link" :loading="running" @click="start">
        <Link2 class="size-4" aria-hidden="true" />Import
      </UiButton>
      <UiButton v-if="running" variant="ghost" @click="cancel">Cancel</UiButton>
    </div>
  </div>
</template>
