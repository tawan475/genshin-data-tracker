/**
 * Per-character progression across every snapshot: level, ascension,
 * constellation and talent changes, dated by the snapshot that first saw
 * them. Only the characters section is fetched; it is tiny and shared by
 * every snapshot in which the roster did not change, so each distinct
 * section is decoded once.
 */

import { decodeCharacters, type GoodCharacter, type KeyRef } from '@gdt/shared'
import { loadBundle, type AccountRef, type DecodedBundle } from './account-data'

export interface ChangeLine {
  label: string
  from: string
  to: string
}

export interface CharacterChange {
  /** takenAt of the snapshot that first showed this state. */
  at: number
  /** first: in the oldest snapshot; obtained: appeared later; changed: progressed. */
  kind: 'first' | 'obtained' | 'changed'
  /** "Lv 90 · A6 · C2 · 9 / 9 / 9" after this change. */
  state: string
  lines: ChangeLine[]
}

export type CharacterHistory = Map<string, CharacterChange[]>

export const talentText = (t: GoodCharacter['talent']) => `${t.auto} / ${t.skill} / ${t.burst}`

const stateText = (c: GoodCharacter) =>
  `Lv ${c.level} · A${c.ascension} · C${c.constellation} · ${talentText(c.talent)}`

function describe(before: GoodCharacter, after: GoodCharacter): ChangeLine[] {
  const lines: ChangeLine[] = []
  if (before.level !== after.level || before.ascension !== after.ascension) {
    lines.push({
      label: 'Level',
      from: `${before.level} · A${before.ascension}`,
      to: `${after.level} · A${after.ascension}`,
    })
  }
  if (before.constellation !== after.constellation) {
    lines.push({
      label: 'Constellation',
      from: `C${before.constellation}`,
      to: `C${after.constellation}`,
    })
  }
  if (talentText(before.talent) !== talentText(after.talent)) {
    lines.push({ label: 'Talents', from: talentText(before.talent), to: talentText(after.talent) })
  }
  return lines
}

/** Walks the snapshots oldest first. Newest change first in each list. */
export function buildCharacterHistory(bundle: DecodedBundle): CharacterHistory {
  const history: CharacterHistory = new Map()
  const last = new Map<string, GoodCharacter>()
  const decoded = new Map<string, GoodCharacter[]>()
  const snapshots = [...bundle.snapshots].sort((a, b) => a.takenAt - b.takenAt)
  let previousHash: string | null = null

  snapshots.forEach((snapshot, index) => {
    const hash = snapshot.characters
    if (hash === previousHash) return
    previousHash = hash
    let roster = decoded.get(hash)
    if (!roster) {
      const text = bundle.texts.get(hash)
      if (text === undefined) return
      roster = decodeCharacters(JSON.parse(text) as KeyRef[][])
      decoded.set(hash, roster)
    }
    for (const character of roster) {
      const before = last.get(character.key)
      last.set(character.key, character)
      let change: CharacterChange | null = null
      if (!before) {
        change = {
          at: snapshot.takenAt,
          kind: index === 0 ? 'first' : 'obtained',
          state: stateText(character),
          lines: [],
        }
      } else {
        const lines = describe(before, character)
        if (lines.length > 0) {
          change = { at: snapshot.takenAt, kind: 'changed', state: stateText(character), lines }
        }
      }
      if (!change) continue
      const list = history.get(character.key)
      if (list) list.push(change)
      else history.set(character.key, [change])
    }
  })

  for (const list of history.values()) list.reverse()
  return history
}

const built = new WeakMap<DecodedBundle, CharacterHistory>()

/** History for every character of the account; cached with the bundle. */
export async function loadCharacterHistory(account: AccountRef): Promise<CharacterHistory> {
  const bundle = await loadBundle(account, { sections: ['characters'] })
  let history = built.get(bundle)
  if (!history) {
    history = buildCharacterHistory(bundle)
    built.set(bundle, history)
  }
  return history
}
