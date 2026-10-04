/**
 * Password limits, shared so the form and the Worker agree. The browser sends
 * the password over HTTPS; the Worker hashes it with Argon2id (see
 * apps/tracker/worker/lib/password.ts).
 */
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 256
