import {
  BOTTOM_REGION,
  DARK_ART,
  LIGHT_ART,
  TOP_REGION,
  regionLuminance,
  type ArtTone,
} from './art-tone'

/** A namecard's tone (art-tone), measured in the browser on a small canvas. */
const cache = new Map<string, Promise<ArtTone>>()

/** The namecard's tone, once per URL; light (nothing changes) when it can't be read. */
export function artTone(url: string): Promise<ArtTone> {
  let tone = cache.get(url)
  if (!tone) {
    tone = measure(url).catch(() => LIGHT_ART)
    cache.set(url, tone)
  }
  return tone
}

async function measure(url: string): Promise<ArtTone> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const width = 84
  const height = 40
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return LIGHT_ART
  ctx.drawImage(img, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return {
    top: regionLuminance(data, width, height, TOP_REGION) < DARK_ART,
    bottom: regionLuminance(data, width, height, BOTTOM_REGION) < DARK_ART,
  }
}
