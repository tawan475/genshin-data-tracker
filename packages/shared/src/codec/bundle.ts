/**
 * The export bundle: snapshot metadata plus the deflated sections they use,
 * sent exactly as stored so the server does no decoding at all. The browser
 * inflates and rebuilds GOOD files itself.
 *
 * Layout (little-endian):
 *   "GDT1" | u32 manifest length | manifest JSON (UTF-8)
 *   then, for each hash in manifest.blobs in order: u32 length | bytes
 */

import { inflateRaw } from './compress'
import type { StoredSnapshot } from './snapshot'

export interface BundleSnapshot {
  id: number
  takenAt: number
  lastSeenAt: number
  format: string
  version: number
  source: string
  characters: string
  weapons: string
  artifacts: string
  materials: string
  materialsKeyframe: string
  achievements: string | null
  // irminsul's extra sections (null when the snapshot has none). Optional:
  // a bundle cached before they existed lacks them.
  player?: string | null
  achievementTimes?: string | null
  characterExtras?: string | null
}

export interface BundleManifest {
  snapshots: BundleSnapshot[]
  /** Hashes of the blobs that follow, in order. */
  blobs: string[]
}

const MAGIC = [0x47, 0x44, 0x54, 0x31] // "GDT1"

export function writeBundle(
  manifest: BundleManifest,
  blobs: ReadonlyMap<string, Uint8Array>,
): Uint8Array<ArrayBuffer> {
  const header = new TextEncoder().encode(JSON.stringify(manifest))
  const parts = manifest.blobs.map((hash) => {
    const data = blobs.get(hash)
    if (!data) throw new Error(`Bundle is missing blob ${hash}`)
    return data
  })
  const size = 8 + header.length + parts.reduce((sum, p) => sum + 4 + p.length, 0)
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  out.set(MAGIC, 0)
  view.setUint32(4, header.length, true)
  out.set(header, 8)
  let offset = 8 + header.length
  for (const part of parts) {
    view.setUint32(offset, part.length, true)
    out.set(part, offset + 4)
    offset += 4 + part.length
  }
  return out
}

export function readBundle(buffer: ArrayBuffer | Uint8Array): {
  manifest: BundleManifest
  blobs: Map<string, Uint8Array>
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('Not a GDT1 bundle')
  const headerLength = view.getUint32(4, true)
  const manifest: BundleManifest = JSON.parse(
    new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)),
  )
  const blobs = new Map<string, Uint8Array>()
  let offset = 8 + headerLength
  for (const hash of manifest.blobs) {
    const length = view.getUint32(offset, true)
    blobs.set(hash, bytes.subarray(offset + 4, offset + 4 + length))
    offset += 4 + length
  }
  return { manifest, blobs }
}

/**
 * One bundle entry as `decodeSnapshot` takes it. `text` returns a section's
 * inflated JSON by hash (and throws when the bundle lacks it); only the
 * sections the snapshot has are asked for.
 */
export function storedSnapshotOf(
  snapshot: BundleSnapshot,
  text: (hash: string) => string,
): StoredSnapshot {
  const optional = (hash: string | null | undefined) => (hash ? text(hash) : null)
  return {
    format: snapshot.format,
    version: snapshot.version,
    source: snapshot.source,
    takenAt: snapshot.takenAt,
    characters: text(snapshot.characters),
    weapons: text(snapshot.weapons),
    artifacts: text(snapshot.artifacts),
    materials: text(snapshot.materials),
    materialsKeyframe:
      snapshot.materialsKeyframe === snapshot.materials ? null : text(snapshot.materialsKeyframe),
    achievements: optional(snapshot.achievements),
    player: optional(snapshot.player),
    achievementTimes: optional(snapshot.achievementTimes),
    characterExtras: optional(snapshot.characterExtras),
  }
}

/** Inflates every blob once; snapshots sharing a section share the text. */
export async function inflateBundle(blobs: ReadonlyMap<string, Uint8Array>) {
  const texts = new Map<string, string>()
  await Promise.all([...blobs].map(async ([hash, data]) => texts.set(hash, await inflateRaw(data))))
  return texts
}
