import { fromBase64, toBase64 } from './base64'

/**
 * Passwords never leave the browser. The browser stretches the password with
 * PBKDF2 under a per-user salt and sends only the derived key; the server
 * stores HMAC(pepper, key). A database leak therefore yields nothing that logs
 * in, and cracking a password still costs a full PBKDF2 run per guess.
 *
 * The iteration count is stored per user, so it can be raised later: the
 * browser re-derives with the new count after the next successful login.
 */
export const PASSWORD_ITERATIONS = 600_000
export const MIN_PASSWORD_ITERATIONS = 100_000
export const MAX_PASSWORD_ITERATIONS = 10_000_000
export const PASSWORD_SALT_BYTES = 16
export const PASSWORD_KEY_BYTES = 32
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 256

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES)))
}

/** The key the browser sends instead of the password. */
export async function derivePasswordKey(
  password: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const saltBytes = fromBase64(salt)
  if (!saltBytes) throw new Error('Invalid salt')
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes as Uint8Array<ArrayBuffer>, iterations },
    material,
    PASSWORD_KEY_BYTES * 8,
  )
  return toBase64(new Uint8Array(bits))
}
