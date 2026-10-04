/**
 * Password hashing: Argon2id (RFC 9106) at OWASP's recommended minimum cost,
 * 19 MiB of memory, 2 passes, 1 lane. About 125 ms of CPU per hash.
 *
 * PASSWORD_PEPPER is Argon2's secret input (RFC 9106 §3.1, "K"), so a leaked
 * database alone cannot be cracked offline. Hashes are stored as PHC strings
 * (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`) that carry their own parameters,
 * so the cost can be raised later: `verifyPassword` reports `rehash` for a
 * hash made under older parameters, and login replaces it.
 */

import { fromBase64, toBase64 } from '@gdt/shared'
import { argon2id } from '@noble/hashes/argon2.js'

export interface Argon2Params {
  m: number
  t: number
  p: number
}

export const ARGON2_PARAMS: Argon2Params = { m: 19_456, t: 2, p: 1 }
const VERSION = 0x13
const SALT_BYTES = 16
const HASH_BYTES = 32

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

/** PHC strings use base64 without padding. */
const b64 = (bytes: Uint8Array) => toBase64(bytes).replace(/=+$/, '')

function derive(password: string, salt: Uint8Array, params: Argon2Params, pepper: string) {
  return argon2id(password.normalize('NFKC'), salt, {
    ...params,
    version: VERSION,
    key: pepper,
    dkLen: HASH_BYTES,
  })
}

export function hashPassword(
  password: string,
  pepper: string,
  params: Argon2Params = ARGON2_PARAMS,
): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = derive(password, salt, params, pepper)
  return `$argon2id$v=19$m=${params.m},t=${params.t},p=${params.p}$${b64(salt)}$${b64(hash)}`
}

function parse(stored: string) {
  const match = PHC.exec(stored)
  if (!match) return null
  const [, m, t, p, salt, hash] = match
  const params = { m: Number(m), t: Number(t), p: Number(p) }
  const saltBytes = fromBase64(salt!)
  const hashBytes = fromBase64(hash!)
  // Bound the cost a stored string can ask for: never more than 64 MiB.
  if (!saltBytes || !hashBytes || params.m > 65_536 || params.t > 10 || params.p > 4) return null
  return { params, salt: saltBytes, hash: hashBytes }
}

/**
 * Stands in for an unknown user's hash, so a failed lookup still spends a full
 * hash and response timing does not reveal which usernames exist.
 */
const DUMMY = {
  params: ARGON2_PARAMS,
  salt: new Uint8Array(SALT_BYTES),
  hash: new Uint8Array(HASH_BYTES),
}

/** Checks a password. `stored` is undefined for an unknown user, which still costs a full hash. */
export function verifyPassword(
  password: string,
  stored: string | undefined,
  pepper: string,
): { ok: boolean; rehash: boolean } {
  const parsed = stored ? parse(stored) : null
  const target = parsed ?? DUMMY
  const hash = derive(password, target.salt, target.params, pepper)
  const ok =
    parsed !== null &&
    hash.byteLength === parsed.hash.byteLength &&
    crypto.subtle.timingSafeEqual(hash, parsed.hash)
  const { m, t, p } = target.params
  const rehash = ok && (m !== ARGON2_PARAMS.m || t !== ARGON2_PARAMS.t || p !== ARGON2_PARAMS.p)
  return { ok, rehash }
}
