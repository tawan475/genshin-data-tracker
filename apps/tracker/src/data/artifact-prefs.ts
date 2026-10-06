/**
 * What the Artifacts page remembers on this device: filters and sort per
 * account, the view, and which panels are open. Values are checked on the
 * way in (data/artifacts.ts), so old or hand-edited ones fall back.
 */

import { readJson, writeJson } from '@/lib/storage'
import { sanitizeFilters, sanitizeView, type ArtifactFilters, type ArtifactView } from './artifacts'

const filtersKey = (accountId: number) => `artifacts:${accountId}`

export function loadFilters(accountId: number): ArtifactFilters {
  return sanitizeFilters(readJson<unknown>(filtersKey(accountId), null))
}

export function saveFilters(accountId: number, filters: ArtifactFilters): void {
  writeJson(filtersKey(accountId), filters)
}

export function loadView(): ArtifactView {
  return sanitizeView(readJson<unknown>('artifacts:view', null))
}

export function saveView(view: ArtifactView): void {
  writeJson('artifacts:view', view)
}

/** A per-device on/off flag (`artifacts:<name>`), e.g. an expanded panel. */
export function loadFlag(name: string, fallback: boolean): boolean {
  const value = readJson<unknown>(`artifacts:${name}`, null)
  return typeof value === 'boolean' ? value : fallback
}

export function saveFlag(name: string, value: boolean): void {
  writeJson(`artifacts:${name}`, value)
}
