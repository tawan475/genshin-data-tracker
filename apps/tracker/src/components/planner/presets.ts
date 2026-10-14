/**
 * Goal presets, pure: one click sets a character goal (and, picking
 * several characters, every one of them). A preset never sets a goal below
 * where the character is now: each part is the preset's or now's, whichever
 * is higher. "Talents only" and "Level only" leave the other part at now.
 */

import type { AscensionPhase } from '@gdt/game-data'
import { normalizeLevel, type CharacterState } from '@gdt/game-data/planner-math'
import type { CharacterTarget } from '@gdt/shared'
import { t } from '@/i18n'
import { goalAtLeast } from './level-grid'

export type PresetId = 'max' | '90-9' | '80-8' | 'talents' | 'level'

export interface Preset {
  id: PresetId
  label: string
  title: string
  /** The goal level (and ascension); none: now's. */
  level: { level: number; ascension: number } | null
  /** All three talents; none: now's. */
  talents: number | null
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'max',
    get label() {
      return t('planner.preset.max.label')
    },
    get title() {
      return t('planner.preset.max.title')
    },
    level: { level: 90, ascension: 6 },
    talents: 10,
  },
  {
    id: '90-9',
    get label() {
      return t('planner.preset.level90.label')
    },
    get title() {
      return t('planner.preset.level90.title')
    },
    level: { level: 90, ascension: 6 },
    talents: 9,
  },
  {
    id: '80-8',
    get label() {
      return t('planner.preset.level80.label')
    },
    get title() {
      return t('planner.preset.level80.title')
    },
    level: { level: 80, ascension: 5 },
    talents: 8,
  },
  {
    id: 'talents',
    get label() {
      return t('planner.preset.talents.label')
    },
    get title() {
      return t('planner.preset.talents.title')
    },
    level: null,
    talents: 9,
  },
  {
    id: 'level',
    get label() {
      return t('planner.preset.level.label')
    },
    get title() {
      return t('planner.preset.level.title')
    },
    level: { level: 90, ascension: 6 },
    talents: null,
  },
]

/** The preset new goals start from (the old default goal: 90, talents at least 9). */
export const DEFAULT_PRESET: PresetId = '90-9'

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? null

/**
 * The goal a preset makes for a character now at `now`, over `base` (the
 * goal's other fields: note, favourite, priority…; `active` defaults on).
 * `phases` (the character's ascension table) keeps the level pair one the
 * game allows.
 */
export function applyPreset(
  preset: Preset,
  now: CharacterState,
  base: Partial<CharacterTarget> = {},
  phases?: readonly AscensionPhase[],
): CharacterTarget {
  const pair = preset.level ?? { level: now.level, ascension: now.ascension }
  const level = phases ? normalizeLevel(phases, pair.level, pair.ascension) : pair
  const t = preset.talents
  const goal = goalAtLeast(
    {
      level: level.level,
      ascension: level.ascension,
      talents: t
        ? { auto: t, skill: t, burst: t }
        : { auto: now.talents.auto, skill: now.talents.skill, burst: now.talents.burst },
    },
    now,
  )
  return { ...base, ...goal, active: base.active ?? true }
}
