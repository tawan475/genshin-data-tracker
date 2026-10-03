const encoder = new TextEncoder()

/**
 * First 128 bits of SHA-256, as 32 hex characters. Used as a content address
 * for artifacts and snapshot sections, which are only ever compared within one
 * account, so 128 bits leaves collisions out of reach while halving index size.
 *
 * Native WebCrypto on purpose: measured in production, a pure-JS SHA-256
 * (@noble/hashes) took ~2.5x the CPU of ~2,000 parallel WebCrypto calls in
 * workerd, although it is faster in Node.
 */
export async function sha256Hex128(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
  let hex = ''
  for (let i = 0; i < 16; i++) hex += digest[i]!.toString(16).padStart(2, '0')
  return hex
}
