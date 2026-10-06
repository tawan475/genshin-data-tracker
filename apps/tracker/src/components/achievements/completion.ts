import type { DoneOn } from '@/data/achievement-progress'
import { formatBetween, formatDate, formatDateTime, nowrap } from '@/lib/format'

/** A row's completion as it reads (`text`) and its tooltip (`title`). */
export interface CompletionText {
  text: string
  title: string
}

/**
 * What a done achievement's row says about when it was completed. `tier`
 * (0-based) prefixes a stage chain's tier: "Tier 2 · Completed …".
 */
export function completionText(done: DoneOn, tier?: number): CompletionText {
  const said = describe(done)
  return tier === undefined ? said : { ...said, text: `Tier ${tier + 1} · ${said.text}` }
}

function describe(done: DoneOn): CompletionText {
  switch (done.kind) {
    case 'exact':
      return {
        text: `Completed ${nowrap(formatDateTime(done.at))}`,
        title: 'Completion time recorded by the game, read by irminsul',
      }
    case 'seen':
      return {
        text: `Completed ${formatBetween(done.since, done.at)}`,
        title: `Done between two captures: not in the one at ${formatDateTime(done.since)}, in the one at ${formatDateTime(done.at)}`,
      }
    case 'by':
      return {
        text: `Completed by ${nowrap(formatDate(done.at))}`,
        title: `Already done in your first capture (${formatDateTime(done.at)})`,
      }
    case 'marked':
      return { text: 'Marked done by hand', title: 'No capture has it, so there is no date' }
  }
}
