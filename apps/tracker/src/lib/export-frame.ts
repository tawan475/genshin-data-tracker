/**
 * A hidden, same-origin iframe of a fixed size to lay out what gets
 * exported as an image (the share card), whatever the window: its viewport
 * is exactly `width` × `height`, so nothing in it depends on the outer
 * window's width, zoom, breakpoints or theme, and phones' text autosizing
 * can't touch it. It carries copies of the page's stylesheets (and Google
 * Fonts), a fixed 16px root, and no transitions or animations, so what is
 * drawn is the settled picture. The caller renders into `mount` (a Vue
 * Teleport) and hands the node to lib/share-image.
 *
 * Off screen (fixed, far left), invisible, inert, out of the tab order and
 * the accessibility tree. One per caller; `destroy` removes it.
 */

export interface ExportFrame {
  readonly document: Document
  /** Where to render: a `width` × `height` box at the frame's origin. */
  readonly mount: HTMLElement
  /** Copies the page's stylesheets again if they changed (dev reloads), and waits for them. */
  sync(): Promise<void>
  /** Waits for the frame's web fonts in the weights the card uses. */
  fontsReady(): Promise<void>
  destroy(): void
}

const COPIED = 'data-export-copy'

function styleNodes(doc: Document): (HTMLLinkElement | HTMLStyleElement)[] {
  return [
    ...doc.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      'link[rel="stylesheet"], style',
    ),
  ].filter((node) => !node.hasAttribute(COPIED))
}

/** Changes when the page's stylesheets do (a dev style update, a new build's link). */
function signature(doc: Document): string {
  return styleNodes(doc)
    .map((node) =>
      node instanceof HTMLLinkElement ? node.href : `${node.textContent?.length ?? 0}`,
    )
    .join('|')
}

function loaded(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => resolve()
    link.addEventListener('load', done, { once: true })
    link.addEventListener('error', done, { once: true })
    setTimeout(done, 5000)
  })
}

export async function openExportFrame(width: number, height: number): Promise<ExportFrame> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('tabindex', '-1')
  iframe.setAttribute('inert', '')
  iframe.title = ''
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    border: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'
  const ready = new Promise<void>((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  )
  document.body.append(iframe)
  await ready

  const doc = iframe.contentDocument!
  // Fixed root and no motion: the export is the settled picture, the same at any window size.
  const base = doc.createElement('style')
  base.textContent =
    `html{font-size:16px;-webkit-text-size-adjust:100%;text-size-adjust:100%;background:transparent}` +
    `body{margin:0;width:${width}px;height:${height}px;overflow:hidden}` +
    `*,*::before,*::after{transition:none!important;animation:none!important}`
  const mount = doc.createElement('div')
  mount.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px`
  doc.body.append(mount)

  let copied = ''
  async function sync() {
    const now = signature(document)
    if (now === copied) return
    copied = now
    doc.head.querySelectorAll(`[${COPIED}]`).forEach((node) => node.remove())
    const links: Promise<void>[] = []
    for (const node of styleNodes(document)) {
      const copy = node.cloneNode(true) as HTMLLinkElement | HTMLStyleElement
      copy.setAttribute(COPIED, '')
      doc.head.append(copy)
      if (copy instanceof HTMLLinkElement) links.push(loaded(copy))
    }
    base.setAttribute(COPIED, '')
    doc.head.append(base) // last, over the app's own root rules
    await Promise.all(links)
  }

  async function fontsReady() {
    await Promise.all(
      ['400', '500', '600', '700'].map((weight) =>
        doc.fonts.load(`${weight} 20px Outfit`).catch(() => undefined),
      ),
    )
    await doc.fonts.ready
  }

  await sync()
  return {
    document: doc,
    mount,
    sync,
    fontsReady,
    destroy: () => iframe.remove(),
  }
}
