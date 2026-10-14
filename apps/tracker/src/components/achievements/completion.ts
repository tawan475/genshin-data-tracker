import type { DoneOn } from '@/data/achievement-progress'
import { t } from '@/i18n'
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
  return tier === undefined
    ? said
    : { ...said, text: t('achievements.completion.tier', { n: tier + 1, text: said.text }) }
}

function describe(done: DoneOn): CompletionText {
  switch (done.kind) {
    case 'exact':
      return {
        text: t('achievements.completion.exact', { time: nowrap(formatDateTime(done.at)) }),
        title: t('achievements.completion.exactTitle'),
      }
    case 'seen':
      return {
        text: t('achievements.completion.seen', { window: formatBetween(done.since, done.at) }),
        title: t('achievements.completion.seenTitle', {
          since: formatDateTime(done.since),
          at: formatDateTime(done.at),
        }),
      }
    case 'by':
      return {
        text: t('achievements.completion.by', { date: nowrap(formatDate(done.at)) }),
        title: t('achievements.completion.byTitle', { at: formatDateTime(done.at) }),
      }
    case 'marked':
      return {
        text: t('achievements.completion.marked'),
        title: t('achievements.completion.markedTitle'),
      }
  }
}
