/**
 * Today's farm plan as Teyvat.me Capture shows it (docs/plans/capture-link.md):
 * the Farm view's sections flattened to text in the language on screen, and
 * published when they change. Capture reads the last one published; the
 * Planner publishes whenever its Today view computes a different plan.
 */

import type { TodayDigest } from '@gdt/shared'
import { materialName } from '@/utils/materials'
import type { FarmSection } from './farm-today'
import { characterName, weaponName } from './model'

/** Who a goal is ("character:Key", "weapon:Key:Owner", "custom:<id>", "item:Key"). */
function goalWho(id: string, customs?: ReadonlyMap<string, string>): string | null {
  const [kind, key = '', owner = ''] = id.split(':')
  if (kind === 'item') return null
  if (kind === 'character' || kind === 'custom') return customs?.get(key) ?? characterName(key)
  return owner ? (customs?.get(owner) ?? characterName(owner)) : weaponName(key)
}

export function todayDigest(
  sections: readonly FarmSection[],
  weekday: number,
  lang: string,
  customs?: ReadonlyMap<string, string>,
): TodayDigest {
  return {
    v: 1,
    lang,
    weekday,
    sections: sections.slice(0, 8).map((section) => ({
      key: section.key,
      resin: section.resin,
      label: section.label,
      cards: section.cards.slice(0, 60).map((card) => ({
        name: card.name.slice(0, 200),
        detail: card.detail.slice(0, 400),
        runs: card.run ? Math.min(Math.ceil(card.run.runs), 100_000) : null,
        resin: Math.min(Math.ceil(card.run?.resin ?? 0), 10_000_000),
        upperBound: card.run?.upperBound ?? false,
        items: card.lines.slice(0, 40).map((line) => ({
          key: line.material.key.slice(0, 120),
          name: materialName(line.material.key).slice(0, 200),
          missing: Math.max(0, Math.round(line.missing)),
        })),
        who: [
          ...new Set(card.goals.map((g) => goalWho(g, customs)).filter((n): n is string => !!n)),
        ]
          .slice(0, 40)
          .map((n) => n.slice(0, 100)),
      })),
    })),
  }
}
