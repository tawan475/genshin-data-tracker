import { decodeAnecdotes as decodeAnecdotesSection, type AnecdotesSection } from '@gdt/shared'
import { loadBundle, type AccountRef } from '@/data/account-data'
import {
  NO_CAPTURED_ANECDOTES,
  capturedAnecdotes,
  type CapturedAnecdotes,
} from '@/data/anecdote-progress'

/** The newest capture's anecdotes (the Anecdotes page and the Collections hub's card). */
export async function loadCapturedAnecdotes(a: AccountRef): Promise<CapturedAnecdotes> {
  const bundle = await loadBundle(a, { sections: ['anecdotes'] })
  // Oldest first: the newest snapshot that has them.
  const newest = [...bundle.snapshots].reverse().find((s) => s.anecdotes)
  const text = newest?.anecdotes ? bundle.texts.get(newest.anecdotes) : undefined
  if (!newest || text === undefined) return NO_CAPTURED_ANECDOTES
  return capturedAnecdotes(
    decodeAnecdotesSection(JSON.parse(text) as AnecdotesSection),
    newest.takenAt,
  )
}
