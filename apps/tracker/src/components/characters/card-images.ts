import type { CharacterView } from '@/data/characters'
import {
  artifactIcon,
  artifactSetIcon,
  characterBanner,
  characterSplash,
  elementIcon,
  weaponIcon,
} from '@/lib/assets'
import { preloadImages } from '@/lib/image-preload'
import { EMBLEM_URL, qualityArt, splashFull } from './share-card'
import { constellationIcons, talentIcons } from './talent-icons'

/**
 * Every image a character's details and share card show (namecard, splash
 * art, constellation and talent icons, element, weapon, the five pieces,
 * the set icons, and the game's header art behind the weapon and pieces:
 * their rarities' gradients and the emblem), once each, empty ones left out.
 */
export function cardImageUrls(c: CharacterView): string[] {
  const talents = talentIcons(c.key)
  const art = [c.weapon?.rarity, ...c.artifacts.map((piece) => piece?.rarity)].map(qualityArt)
  const urls = [
    splashFull(c.key)?.src ?? characterSplash(c.key),
    characterBanner(c.key),
    ...constellationIcons(c.key),
    talents.auto,
    talents.skill,
    talents.burst,
    c.element ? elementIcon(c.element) : '',
    c.weapon ? weaponIcon(c.weapon.key, c.weapon.ascension) : '',
    ...c.artifacts.map((piece) => (piece ? artifactIcon(piece.setKey, piece.slotKey) : '')),
    ...c.sets.map((set) => artifactSetIcon(set.setKey)),
    ...art,
    art.some(Boolean) ? EMBLEM_URL : '',
  ]
  return [...new Set(urls.filter(Boolean))]
}

/**
 * Fetches and decodes a character's card images ahead (bounded, see
 * lib/image-preload); resolves once they have all decoded or failed.
 */
export function preloadCharacter(c: CharacterView | null | undefined): Promise<void> {
  return c ? preloadImages(cardImageUrls(c)) : Promise.resolve()
}
