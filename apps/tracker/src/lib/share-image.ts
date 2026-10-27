/**
 * A share card's PNG leaving the page: download, clipboard, the system share
 * sheet. The PNG itself is drawn on a canvas (lib/card-canvas).
 */

/** Whether this browser can put a PNG on the clipboard. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'
}

/**
 * Copies a PNG. Takes the promise, not the blob: Safari only allows the
 * write while the click is current, so the item must be made in the click.
 */
export function copyPng(blob: Promise<Blob>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Whether the system share sheet takes files (phones, some desktops). */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export function sharePng(blob: Blob, filename: string, title: string): Promise<void> {
  return navigator.share({ files: [new File([blob], filename, { type: 'image/png' })], title })
}
