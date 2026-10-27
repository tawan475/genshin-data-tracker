/**
 * Encodes a drawn share card as a PNG off the main thread (lib/card-canvas
 * canvasPng): a 1920×1080 PNG takes a few hundred ms to compress, which on
 * the page's thread froze it.
 */

interface Job {
  id: number
  bitmap: ImageBitmap
}

self.onmessage = async ({ data: { id, bitmap } }: MessageEvent<Job>) => {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    self.postMessage({ id, blob })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}
