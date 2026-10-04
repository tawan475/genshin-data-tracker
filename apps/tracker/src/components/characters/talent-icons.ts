/**
 * Talent and constellation glyphs from the Enka CDN (same source and table as
 * `@/lib/assets`). They are white shapes on transparency, so callers draw
 * them as a CSS mask in the current text colour (see EnkaGlyph).
 */

import assetData from '@/utils/data/AssetsData_gen.json'
import type { WeaponType } from '@/data/characters'

const ENKA = 'https://enka.network/ui'

type CharacterAssets = Partial<
  Record<
    | 'skill'
    | 'burst'
    | 'constellation1'
    | 'constellation2'
    | 'constellation3'
    | 'constellation4'
    | 'constellation5'
    | 'constellation6',
    string
  >
>

const chars = assetData.chars as Record<string, CharacterAssets>
const url = (name: string | undefined) => (name ? `${ENKA}/${name}.png` : '')

/** Normal attack icons follow the weapon type. */
const ATTACK: Record<WeaponType, string> = {
  sword: 'Skill_A_01',
  bow: 'Skill_A_02',
  polearm: 'Skill_A_03',
  claymore: 'Skill_A_04',
  catalyst: 'Skill_A_Catalyst_MD',
}

export function talentIcons(
  key: string,
  weaponType: WeaponType | null,
): { auto: string; skill: string; burst: string } {
  const info = chars[key]
  // No skill art (e.g. the element-less Traveler): show no glyphs at all.
  return {
    auto: url(weaponType && info?.skill ? ATTACK[weaponType] : undefined),
    skill: url(info?.skill),
    burst: url(info?.burst),
  }
}

/** C1–C6 icons ('' where unknown, e.g. the element-less Traveler). */
export function constellationIcons(key: string): string[] {
  const info = chars[key]
  return ([1, 2, 3, 4, 5, 6] as const).map((n) => url(info?.[`constellation${n}`]))
}
