/**
 * Planner goal ids, as the page names goals (totals' "who needs it", the
 * editor's `?goal=`, hand-set current states): `character:Key`,
 * `custom:<id>` (a custom character), `weapon:Key:Owner:<id>` (each weapon
 * goal has its own id, so a weapon can have several) and `item:Key`.
 */

import type { EditorSubject } from './model'

export const characterGoalId = (key: string) => `character:${key}`
export const customGoalId = (key: string) => `custom:${key}`
export const weaponGoalId = (key: string, owner: string, id: string) =>
  `weapon:${key}:${owner}:${id}`
export const itemGoalId = (key: string) => `item:${key}`

export function targetId(t: {
  kind: 'character' | 'custom' | 'weapon' | 'item'
  key: string
  owner?: string
  id?: string
}) {
  if (t.kind === 'character') return characterGoalId(t.key)
  if (t.kind === 'custom') return customGoalId(t.key)
  if (t.kind === 'item') return itemGoalId(t.key)
  return weaponGoalId(t.key, t.owner ?? '', t.id ?? '')
}

/** What a goal id (`?goal=` in the URL) names; a weapon goal by its own id. Null when it isn't one. */
export function parseGoalId(raw: unknown): EditorSubject | null {
  if (typeof raw !== 'string') return null
  const parts = raw.split(':')
  const kind = parts[0]
  if (kind === 'weapon') {
    const id = parts[3] ?? ''
    return /^[a-z0-9]{6,32}$/.test(id) ? { kind, id } : null
  }
  const key = parts[1] ?? ''
  if (!/^[A-Za-z0-9]{1,64}$/.test(key)) return null
  if (kind === 'character' || kind === 'custom' || kind === 'item') return { kind, key }
  return null
}

/** A new weapon goal's id (12 base-36 digits). */
export function newGoalId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map((b) => (b % 36).toString(36)).join('')
}
