import { toBase64, toBase64Url } from '@gdt/shared'

const encoder = new TextEncoder()
const hmacKeys = new Map<string, Promise<CryptoKey>>()

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** HMAC-SHA256 with a secret; the imported key is cached per isolate. */
export async function hmac(secret: string, data: string | Uint8Array): Promise<Uint8Array> {
  let key = hmacKeys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    hmacKeys.set(secret, key)
  }
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', await key, bytes as Uint8Array<ArrayBuffer>),
  )
}

export async function hmacBase64(secret: string, data: string | Uint8Array): Promise<string> {
  return toBase64(await hmac(secret, data))
}

/** Constant-time comparison of two strings of possibly different length. */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.byteLength !== right.byteLength) return false
  return crypto.subtle.timingSafeEqual(left, right)
}
