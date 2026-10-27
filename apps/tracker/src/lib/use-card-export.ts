import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Check, Copy, Download, Share2, TriangleAlert } from 'lucide-vue-next'
import { t } from '@/i18n'
import { openExportFrame, type ExportFrame } from './export-frame'
import {
  canCopyImage,
  canShareFiles,
  copyPng,
  downloadBlob,
  renderPng,
  sharePng,
} from './share-image'

export type ExportAction = 'png' | 'copy' | 'share'
type FailureKey = 'exportFailed' | 'copyFailed' | 'shareFailed'

export interface CardExportOptions {
  /**
   * The hidden frame's viewport in CSS pixels and the PNG's scale; the PNG is
   * that size too unless `measure` says otherwise.
   */
  width: number
  height: number
  scale: number
  /** The PNG's size in CSS pixels from the laid-out card (a card whose height varies). */
  measure?: (node: HTMLElement) => { width: number; height: number }
  /** The card the export draws, rendered into `frame.mount` (a Teleport). */
  node: () => HTMLElement | undefined
  /**
   * Draws the PNG itself (a card drawn on a canvas, the roster): no hidden
   * frame, no DOM capture; `node` and the frame's size are then unused.
   */
  draw?: () => Promise<{ blob: Blob; missing: number }>
  /** Whether there is a card to draw (false closes the frame). */
  open: () => boolean
  /** What the PNG depends on; a change drops the drawn one. */
  state: () => unknown
  filename: () => string
  /** The share sheet's title. */
  title: () => string
  /** The PNG button's tooltip, e.g. "Download 1920 × 1080 PNG" (read when shown). */
  pngLabel: () => string
}

/**
 * Exporting a share card as a PNG (the character card, the artifact card):
 * drawn on demand in its own hidden fixed-size iframe (lib/export-frame), so
 * the picture is the same at any window size, zoom or aspect ratio, and kept
 * until something on the card changes. `warm` (pointing at the actions,
 * opening a phone menu) starts it silently, so the click that follows
 * answers at once: the share sheet and Safari's clipboard need the click to
 * still be current. A click still waiting shows a spinner in its own icon;
 * a result swaps the icon (a check, or a warning with the reason in the
 * tooltip). The frame stays for the next export and goes when the card does.
 */
export function useCardExport(options: CardExportOptions) {
  /** The hidden iframe the export draws in; opened on first use, closed with the card. */
  const frame = shallowRef<ExportFrame | null>(null)
  let opening: Promise<ExportFrame> | null = null
  const result = shallowRef<Promise<Blob> | null>(null)
  /** The drawn PNG is ready (no wait on a click). */
  const ready = ref(false)
  const missing = ref(0)
  /** The action whose click is waiting for the PNG or the clipboard. */
  const waiting = ref<ExportAction | null>(null)
  /** Briefly, the action that just succeeded. */
  const done = ref<ExportAction | null>(null)
  /** The last action that failed, with why (a `share.export` message). */
  const failure = ref<{ action: ExportAction; text: FailureKey } | null>(null)
  let generation = 0
  let doneTimer: ReturnType<typeof setTimeout> | undefined

  watch(options.state, () => {
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
    opening ??= openExportFrame(options.width, options.height).then((opened) => {
      opening = null
      if (!options.open()) {
        opened.destroy() // the card closed meanwhile
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
      if (options.draw) {
        const drawn = await options.draw()
        if (id === generation) {
          missing.value = drawn.missing
          ready.value = true
        }
        return drawn.blob
      }
      const target = await ensureFrame()
      await target.sync()
      await nextTick()
      const node = options.node()
      if (!node) throw new Error('No card')
      await imagesLoaded(node)
      await target.fontsReady()
      const size = options.measure?.(node) ?? { width: options.width, height: options.height }
      const drawn = await renderPng(node, { ...size, scale: options.scale })
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
    if (options.open() && !result.value) void png().catch(() => undefined)
  }

  /** Runs a click's action: a spinner in its own icon while it waits, then a check or a warning. */
  async function run(action: ExportAction, task: () => Promise<void>, failed: FailureKey) {
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

  const shareable = canShareFiles()
  const copyable = canCopyImage()

  function download() {
    void run('png', async () => downloadBlob(await png(), options.filename()), 'exportFailed')
  }
  function copy() {
    // The clipboard item is made in the click, with the PNG still on its way (Safari).
    void run('copy', () => copyPng(png()), 'copyFailed')
  }
  function share() {
    void run(
      'share',
      async () => sharePng(await png(), options.filename(), options.title()),
      'shareFailed',
    )
  }

  const ICONS = { png: Download, copy: Copy, share: Share2 } as const
  const label = (action: ExportAction) =>
    action === 'png'
      ? options.pngLabel()
      : action === 'copy'
        ? t('share.export.copyImage')
        : t('share.export.share')

  /** An action's icon and tooltip now: idle, waiting, done, failed, or done with images missing. */
  function actionState(action: ExportAction) {
    const missed = missing.value
      ? t('share.export.missing', { n: missing.value }, missing.value)
      : ''
    if (waiting.value === action)
      return { icon: null, tone: '', title: t('share.export.drawing', { label: label(action) }) }
    if (failure.value?.action === action) {
      return {
        icon: TriangleAlert,
        tone: 'text-danger-text',
        title: t(`share.export.${failure.value.text}`),
      }
    }
    if (done.value === action) {
      return missed
        ? { icon: TriangleAlert, tone: 'text-warning-text', title: missed }
        : {
            icon: Check,
            tone: '',
            title: action === 'copy' ? t('share.export.copied') : label(action),
          }
    }
    return { icon: ICONS[action], tone: '', title: label(action) }
  }

  /** The header's icon actions (share, copy) this browser offers. */
  const iconActions = computed(
    () => [shareable ? 'share' : null, copyable ? 'copy' : null].filter(Boolean) as ExportAction[],
  )

  watch(
    () => options.open(),
    (isOpen) => {
      if (isOpen) return
      closeFrame()
      done.value = null
      failure.value = null
    },
  )
  onBeforeUnmount(closeFrame)

  return {
    frame,
    ready,
    missing,
    waiting,
    done,
    failure,
    shareable,
    copyable,
    iconActions,
    warm,
    download,
    copy,
    share,
    actionState,
  }
}

export type CardExport = ReturnType<typeof useCardExport>
