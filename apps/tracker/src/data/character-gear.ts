/**
 * A character's gear across captures, the pure part of time travel on the
 * character dialog (the loading is character-builds). Swapping pieces often
 * must never flood the History list, so gear changes fold into one row per
 * day with the builds captured that day.
 */

import type { ArtifactIdentity, CatalogEntry, GiCapture, GoodWeapon } from '@gdt/shared'
import { t } from '@/i18n'
import { SLOT_ORDER, type CharacterView, type SlotKey } from './characters'

/** What a character wore at one capture: the weapon and a catalog id per slot (SLOT_ORDER). */
export interface Gear {
  weapon: GoodWeapon | null
  pieces: (number | null)[]
}

export interface Capture {
  snapshotId: number
  at: number
  /** Why Teyvat.me Capture took it (null for uploads without `gi_capture`). */
  capture: GiCapture | null
  /** Null when the capture holds no gear for the character (see `knownGear`). */
  gear: Gear | null
}

export type PieceChange =
  | { slot: SlotKey; kind: 'levelled'; from: number; to: number }
  /** Catalog ids of the piece before and after. */
  | { slot: SlotKey; kind: 'swapped'; ids: [number, number] }
  | { slot: SlotKey; kind: 'added' | 'removed' }

export interface WeaponChange {
  kind: 'swapped' | 'upgraded' | 'added' | 'removed'
  from: GoodWeapon | null
  to: GoodWeapon | null
}

/** A capture whose gear differs from the one before it. */
export interface BuildStep extends Capture {
  gear: Gear
  pieces: PieceChange[]
  weapon: WeaponChange | null
  cv: number
  rv: number
  /** Sets worn, most pieces first. */
  sets: { setKey: string; count: number }[]
}

/** One day's gear changes: a single History row, however many swaps. */
export interface GearDay {
  kind: 'gear'
  /** The day's newest step. */
  at: number
  /** Newest first. */
  steps: BuildStep[]
  /** Slots that ended the day on another piece than they started with. */
  slots: SlotKey[]
  /** Some step changed a piece / the weapon. */
  artifacts: boolean
  weapon: boolean
  /** The day ended on the build it started with. */
  sameEnd: boolean
  cvFrom: number
  cvTo: number
}

/** "Login", "World 2", "Logout", "Capture": why a capture was taken (null for plain uploads). */
export function captureLabel(capture: GiCapture | null): string | null {
  if (!capture) return null
  if (capture.reason === 'login') return t('characters.builds.reason.login')
  if (capture.reason === 'logout') return t('characters.builds.reason.logout')
  if (capture.reason === 'world') return t('live.session.world', { n: capture.world })
  return t('characters.builds.reason.capture')
}

const weaponSig = (w: GoodWeapon | null) =>
  w ? `${w.key}:${w.level}:${w.ascension}:${w.refinement}` : ''

/**
 * The gear as a capture records it, or null when it records none: a
 * character always holds a weapon, so one without is a capture whose
 * equipment was not read (some world change and logout snapshots have every
 * item unequipped). That covers a capture where nobody wears anything too.
 * Such a capture is no gear change and no build to view.
 */
export function knownGear(gear: Gear): Gear | null {
  return gear.weapon ? gear : null
}

export function sameGear(a: Gear, b: Gear): boolean {
  return (
    weaponSig(a.weapon) === weaponSig(b.weapon) && a.pieces.every((id, i) => id === b.pieces[i])
  )
}

/**
 * Whether `to` is `from` levelled up: a piece keeps no id across level-ups
 * (its catalog identity includes the level), so the same piece levelled reads
 * as the same set, slot, rarity and main stat, a higher level, and every
 * substat it had still there and no lower.
 */
export function isLevelled(from: ArtifactIdentity, to: ArtifactIdentity): boolean {
  if (
    from.setKey !== to.setKey ||
    from.slotKey !== to.slotKey ||
    from.rarity !== to.rarity ||
    from.mainStatKey !== to.mainStatKey ||
    to.level <= from.level
  ) {
    return false
  }
  const after = new Map(to.substats.map((s) => [s.key, s.value]))
  return from.substats.every((s) => (after.get(s.key) ?? -1) >= s.value - 0.05)
}

function pieceChanges(
  before: Gear,
  after: Gear,
  catalog: ReadonlyMap<number, ArtifactIdentity>,
): PieceChange[] {
  const out: PieceChange[] = []
  SLOT_ORDER.forEach((slot, i) => {
    const a = before.pieces[i] ?? null
    const b = after.pieces[i] ?? null
    if (a === b) return
    if (a === null) return out.push({ slot, kind: 'added' })
    if (b === null) return out.push({ slot, kind: 'removed' })
    const from = catalog.get(a)
    const to = catalog.get(b)
    if (from && to && isLevelled(from, to)) {
      out.push({ slot, kind: 'levelled', from: from.level, to: to.level })
    } else {
      out.push({ slot, kind: 'swapped', ids: [a, b] })
    }
  })
  return out
}

function weaponChange(before: GoodWeapon | null, after: GoodWeapon | null): WeaponChange | null {
  if (weaponSig(before) === weaponSig(after)) return null
  const kind = !before
    ? 'added'
    : !after
      ? 'removed'
      : before.key === after.key
        ? 'upgraded'
        : 'swapped'
  return { kind, from: before, to: after }
}

function gearFigures(gear: Gear, catalog: ReadonlyMap<number, CatalogEntry>) {
  let cv = 0
  let rv = 0
  const sets = new Map<string, number>()
  for (const id of gear.pieces) {
    const piece = id === null ? undefined : catalog.get(id)
    if (!piece) continue
    cv += piece.cv
    rv += piece.rv
    sets.set(piece.setKey, (sets.get(piece.setKey) ?? 0) + 1)
  }
  return {
    cv: Number(cv.toFixed(1)),
    rv: Math.round(rv),
    sets: [...sets]
      .map(([setKey, count]) => ({ setKey, count }))
      .sort((a, b) => b.count - a.count || a.setKey.localeCompare(b.setKey)),
  }
}

/** The local calendar day of a time ("2026-10-27"). */
export function localDay(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * The character's gear changes as one row per day, newest day first. The
 * first capture is where the character was first seen, not a change; one
 * without gear is skipped (the next is compared with the one before it).
 * `captures` are the character's, oldest first.
 */
export function gearDays(
  captures: readonly Capture[],
  catalog: ReadonlyMap<number, CatalogEntry>,
  dayOf: (at: number) => string = localDay,
): GearDay[] {
  const days: { key: string; start: Gear; steps: BuildStep[] }[] = []
  let previous: Gear | null = null
  for (const capture of captures) {
    const { gear } = capture
    if (!gear) continue
    const before = previous
    previous = gear
    if (!before || sameGear(before, gear)) continue
    const step: BuildStep = {
      ...capture,
      gear,
      pieces: pieceChanges(before, gear, catalog),
      weapon: weaponChange(before.weapon, gear.weapon),
      ...gearFigures(gear, catalog),
    }
    const key = dayOf(capture.at)
    const last = days[days.length - 1]
    if (last?.key === key) last.steps.push(step)
    else days.push({ key, start: before, steps: [step] })
  }
  return days
    .map(({ start, steps }): GearDay => {
      const end = steps[steps.length - 1]!
      const first = gearFigures(start, catalog)
      const slots = SLOT_ORDER.filter((_, i) => start.pieces[i] !== end.gear.pieces[i])
      return {
        kind: 'gear',
        at: end.at,
        steps: [...steps].reverse(),
        slots,
        artifacts: steps.some((s) => s.pieces.length > 0),
        weapon: steps.some((s) => s.weapon !== null),
        sameEnd: sameGear(start, end.gear),
        cvFrom: first.cv,
        cvTo: end.cv,
      }
    })
    .reverse()
}

type Identity = Pick<
  ArtifactIdentity,
  'setKey' | 'slotKey' | 'level' | 'rarity' | 'mainStatKey' | 'substats'
>

const sameIdentity = (a: Identity, b: Identity) =>
  a.setKey === b.setKey &&
  a.slotKey === b.slotKey &&
  a.level === b.level &&
  a.rarity === b.rarity &&
  a.mainStatKey === b.mainStatKey &&
  a.substats.length === b.substats.length &&
  a.substats.every((s, i) => s.key === b.substats[i]?.key && s.value === b.substats[i]?.value)

/** Slots (and `weapon`) where a past build differs from another, e.g. now. */
export function gearDiff(past: CharacterView, now: CharacterView): (SlotKey | 'weapon')[] {
  const out: (SlotKey | 'weapon')[] = []
  if (weaponSig(past.weapon) !== weaponSig(now.weapon)) out.push('weapon')
  SLOT_ORDER.forEach((slot, i) => {
    const a = past.artifacts[i] ?? null
    const b = now.artifacts[i] ?? null
    if (a === null && b === null) return
    if (a === null || b === null || !sameIdentity(a, b)) out.push(slot)
  })
  return out
}
