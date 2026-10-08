/**
 * The artifact card's look (ArtifactCard), after the game's artifact detail
 * panel: the art band's geometry and the body's colours, the game's cream on
 * the light theme and a deep slate in the same layout on the dark one.
 */

import { emblemFromRight } from '@/lib/item-art'

/** The art band: 122px tall, the piece 94px, 7px from its right edge. */
export const BAND_HEIGHT = 122
export const BAND_ICON = 94
export const BAND_ICON_RIGHT = 7
export const BAND_EMBLEM_STYLE = emblemFromRight(BAND_HEIGHT, BAND_ICON_RIGHT, BAND_ICON)

/** The body under the band. */
export const CARD_BODY = 'bg-[#ece5d8] text-[#495366] dark:bg-[#1b2131] dark:text-[#dfe3ec]'
/** The set name, in the game's green. */
export const CARD_SET = 'text-[#5c9d48] dark:text-[#8fd46e]'
/** The "Equipped" bar. */
export const CARD_FOOT = 'bg-[#f3e6cc] dark:bg-[#242b3e]'
/** Secondary text on the body (labels, the substats' dots). */
export const CARD_MUTED = 'text-[#7a8295] dark:text-[#8b93a7]'
/** A dark chip on the art band (+20, CV, RV). */
export const BAND_CHIP = 'rounded-[4px] bg-[rgba(30,16,4,0.55)] px-1.5 leading-5'
/** Text on the art band. */
export const BAND_TEXT = 'text-white [text-shadow:0_1px_2px_rgba(70,36,6,0.55)]'

/**
 * The share picture (ArtifactShareCard): the card alone, 400 CSS pixels wide
 * and as tall as it lays out (the frame leaves it room), at 2.7× (1080 wide).
 */
export const ARTIFACT_SHARE_WIDTH = 400
export const ARTIFACT_SHARE_FRAME_HEIGHT = 900
export const ARTIFACT_SHARE_SCALE = 2.7
