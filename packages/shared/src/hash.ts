import { sha256 } from '@noble/hashes/sha2.js'

const encoder = new TextEncoder()

/**
 * First 128 bits of SHA-256, as 32 hex characters. Used as a content address
 * for artifacts and snapshot sections, which are only ever compared within one
 * account, so 128 bits leaves collisions out of reach while halving index size.
 *
 * Synchronous on purpose: an import hashes ~2,000 small artifact texts, and a
 * pure-JS SHA-256 beats ~2,000 async WebCrypto calls, whose per-call overhead
 * dwarfs the hashing itself. The output is plain SHA-256 either way.
 */
export function sha256Hex128(text: string): string {
  const digest = sha256(encoder.encode(text))
  let hex = ''
  for (let i = 0; i < 16; i++) hex += digest[i]!.toString(16).padStart(2, '0')
  return hex
}
