const encoder = new TextEncoder()

/**
 * First 128 bits of SHA-256, as 32 hex characters. Used as a content address
 * for artifacts and snapshot sections, which are only ever compared within one
 * account, so 128 bits leaves collisions out of reach while halving index size.
 */
export async function sha256Hex128(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return toHex(new Uint8Array(digest, 0, 16))
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}
