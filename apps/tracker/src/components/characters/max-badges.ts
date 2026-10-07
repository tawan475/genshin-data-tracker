import { MAX_REFINEMENT } from '@/data/weapons'

/**
 * The constellation and refinement badges in the game's colours (sampled
 * from in-game screenshots), maxed or not, the same in both themes: the
 * share card's chips and the details' labels (ConstellationStars,
 * RefinementPips).
 */

export const MAX_CONSTELLATION = 6

export const isMaxConstellation = (level: number): boolean => level >= MAX_CONSTELLATION

/**
 * Whether a refinement is the weapon's last. The game data has no maximum
 * per weapon (every weapon in the game today has 5), so it defaults to
 * MAX_REFINEMENT.
 */
export const isMaxRefinement = (refinement: number, max: number = MAX_REFINEMENT): boolean =>
  refinement >= max

/** C6: the game's gold chip. Below it, each place keeps its own look. */
export const CONSTELLATION_MAX_STYLE = {
  background: 'linear-gradient(180deg, #fcde54 0%, #f0cc4e 100%)',
  color: '#8a4e24',
  boxShadow: '0 1px 4px rgba(80,50,0,0.45)',
} as const

const REFINEMENT_MAX_STYLE = { background: '#a86858', color: '#f8e048' } as const
const REFINEMENT_STYLE = { background: '#303048', color: '#c8c8c8' } as const

/** The refinement badge: R5 yellow on rose-brown, R1–R4 grey on slate, as in game. */
export function refinementStyle(
  refinement: number,
  max: number = MAX_REFINEMENT,
): { background: string; color: string } {
  return isMaxRefinement(refinement, max) ? REFINEMENT_MAX_STYLE : REFINEMENT_STYLE
}
