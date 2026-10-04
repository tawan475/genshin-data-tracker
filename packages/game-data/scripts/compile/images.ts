/**
 * Image names (data/images.json) for everything the tracker shows besides
 * materials and achievement categories, straight from the dump:
 *
 * - Characters (one entry per planner key): portrait `AvatarExcelConfigData.iconName`;
 *   namecard banner from the friendship reward (`FetterCharacterCard` ->
 *   `Reward` -> the namecard's `_P` picture), else the namecard named after
 *   the portrait (`UI_NameCardPic_<name>_P`, Nod-Krai characters' friendship
 *   reward is a box); normal attack, skill and burst are the `skillIcon` of the
 *   skill depot's `skills[0]`, `skills[1]` and `energySkill`; C1-C6 are the
 *   depot's `talents` (`AvatarTalent.icon`; Manekin(a) has none). The Traveler gets the depot of
 *   its key's element; Manekin(a) must look the same in every element.
 * - The Traveler's portrait per twin.
 * - Weapons: `icon` and `awakenIcon` (ascended art).
 * - Artifact sets by GOOD key (the set's `EquipAffix` name through
 *   toGoodKey, as irminsul names sets): each slot's `Reliquary.icon`.
 * - A few items the app shows without loading the material index.
 *
 * Bursts use the plain `skillIcon` (64 px). The `_HD` variant (128 px, same
 * art with more padding) is not in the data, and static.nanoka.cc lacks it
 * for 17 newer characters.
 */

import type {
  ArtifactSlot,
  CharacterImagesRow,
  ImagesFile,
  MaterialIndexFile,
  PlannerFile,
} from '../../src/format.ts'
import { entryIcon } from '../../src/icons.ts'
import { checkFields, list, num, str, type Row, type TextMap } from '../lib/excel.ts'
import { sortedObject } from '../lib/json.ts'
import type { Problems } from '../lib/problems.ts'
import { ELEMENTS } from './planner.ts'

export const IMAGE_FILES = {
  fetterCards: 'ExcelBinOutput/FetterCharacterCardExcelConfigData.json',
  reliquaries: 'ExcelBinOutput/ReliquaryExcelConfigData.json',
  reliquarySets: 'ExcelBinOutput/ReliquarySetExcelConfigData.json',
  equipAffixes: 'ExcelBinOutput/EquipAffixExcelConfigData.json',
} as const

export interface ImageInputs {
  avatars: Row[]
  depots: Row[]
  skills: Row[]
  avatarTalents: Row[]
  weapons: Row[]
  materials: Row[]
  rewards: Row[]
  fetterCards: Row[]
  reliquaries: Row[]
  reliquarySets: Row[]
  equipAffixes: Row[]
  /** TextMap_MediumEN: the names irminsul turns into GOOD keys. */
  names: TextMap
}

export interface ImageContext {
  planner: PlannerFile
  materials: MaterialIndexFile
  toGoodKey: (name: string) => string
  problems: Problems
}

/** The twins' portraits, which name their gender (stable since 1.0). */
const TRAVELER_ICONS = { F: 'UI_AvatarIcon_PlayerGirl', M: 'UI_AvatarIcon_PlayerBoy' } as const

/** `Reliquary.equipType` -> GOOD slot, in the order of `ImagesFile.artifacts`. */
const SLOTS: [string, ArtifactSlot][] = [
  ['EQUIP_BRACER', 'flower'],
  ['EQUIP_NECKLACE', 'plume'],
  ['EQUIP_SHOES', 'sands'],
  ['EQUIP_RING', 'goblet'],
  ['EQUIP_DRESS', 'circlet'],
]

/** Items the app shows outside the material pages (Primogem rewards, Mora costs, Sanctifying items). */
export const IMAGE_ITEMS = ['Mora', 'Primogem', 'SanctifyingEssence', 'SanctifyingUnction']

export const CHARACTER_IMAGE_COLUMNS = [
  'icon',
  'namecard',
  'attack',
  'skill',
  'burst',
  'constellations',
]

function checkInputs(inputs: ImageInputs, problems: Problems): void {
  checkFields(problems, 'AvatarExcelConfigData', inputs.avatars, { iconName: 0.9 })
  checkFields(problems, 'AvatarSkillExcelConfigData', inputs.skills, { skillIcon: 0.5 })
  checkFields(problems, 'AvatarSkillDepotExcelConfigData', inputs.depots, { talents: 0.3 })
  checkFields(problems, 'AvatarTalentExcelConfigData', inputs.avatarTalents, {
    talentId: 0.99,
    icon: 0.9,
  })
  checkFields(problems, 'WeaponExcelConfigData', inputs.weapons, { icon: 0.9, awakenIcon: 0.5 })
  // Only namecards have pictures (293 in 7.1).
  checkFields(problems, 'MaterialExcelConfigData', inputs.materials, { picPath: 100 })
  checkFields(problems, 'RewardExcelConfigData', inputs.rewards, {
    rewardId: 0.99,
    rewardItemList: 0.9,
  })
  checkFields(problems, 'FetterCharacterCardExcelConfigData', inputs.fetterCards, {
    avatarId: 0.99,
    rewardId: 0.99,
  })
  checkFields(problems, 'ReliquaryExcelConfigData', inputs.reliquaries, {
    id: 0.99,
    equipType: 0.9,
    icon: 0.9,
  })
  checkFields(problems, 'ReliquarySetExcelConfigData', inputs.reliquarySets, {
    setId: 0.99,
    containsList: 0.9,
    equipAffixId: 0.8,
  })
  checkFields(problems, 'EquipAffixExcelConfigData', inputs.equipAffixes, {
    id: 0.99,
    nameTextMapHash: 0.99,
  })
}

export function compileImages(inputs: ImageInputs, context: ImageContext): ImagesFile {
  const { problems, planner } = context
  checkInputs(inputs, problems)

  const avatars = new Map(inputs.avatars.map((a) => [num(a, 'id'), a]))
  const depots = new Map(inputs.depots.map((d) => [num(d, 'id'), d]))
  const skills = new Map(inputs.skills.map((s) => [num(s, 'id'), s]))
  const talents = new Map(inputs.avatarTalents.map((t) => [num(t, 'talentId'), t]))
  const materials = new Map(inputs.materials.map((m) => [num(m, 'id'), m]))
  const rewards = new Map(inputs.rewards.map((r) => [num(r, 'rewardId'), r]))
  const skillIcon = (id: number) => str(skills.get(id) ?? {}, 'skillIcon')

  // --- namecards --------------------------------------------------------------
  const namecardPictures = new Set<string>()
  for (const m of inputs.materials) {
    if (str(m, 'materialType') !== 'MATERIAL_NAMECARD') continue
    for (const pic of list<string>(m, 'picPath')) if (pic) namecardPictures.add(pic)
  }
  const friendshipCard = new Map<number, string>()
  for (const card of inputs.fetterCards) {
    const reward = rewards.get(num(card, 'rewardId'))
    const item = materials.get(num(list(reward ?? {}, 'rewardItemList')[0] ?? {}, 'itemId'))
    const banner =
      item && str(item, 'materialType') === 'MATERIAL_NAMECARD'
        ? (list<string>(item, 'picPath').find((p) => p.endsWith('_P')) ?? '')
        : ''
    friendshipCard.set(num(card, 'avatarId'), banner)
  }
  const namecardOf = (avatar: Row, what: string): string => {
    const id = num(avatar, 'id')
    const card = friendshipCard.get(id)
    if (card) return card
    const named = `UI_NameCardPic_${str(avatar, 'iconName').replace(/^UI_AvatarIcon_/, '')}_P`
    if (namecardPictures.has(named)) return named
    // Only characters with a friendship reward have a namecard (not the Traveler, Manekin(a)).
    if (card !== undefined) problems.warn(`${what}: no namecard found (tried ${named})`)
    return ''
  }

  // --- characters ---------------------------------------------------------------
  const characters: [string, CharacterImagesRow][] = []
  for (const [key, id, , element] of planner.characters) {
    const what = `Character ${key} (${id})`
    const avatar = avatars.get(id)
    if (!avatar) {
      problems.error(`${what}: not in AvatarExcelConfigData`)
      continue
    }
    const traveler = key.startsWith('Traveler')
    const icon = traveler ? '' : str(avatar, 'iconName')
    if (!traveler && !icon) problems.error(`${what}: no iconName`)

    const depotIds = list<number>(avatar, 'candSkillDepotIds').filter((d) => d > 0)
    if (depotIds.length === 0) depotIds.push(num(avatar, 'skillDepotId'))
    const variants: string[][] = []
    for (const depotId of depotIds) {
      const depot = depots.get(depotId)
      const burst = num(depot ?? {}, 'energySkill')
      // No burst: the element-less Traveler, which has no planner key.
      if (!depot || !burst) continue
      // A Traveler key shows its own element's depot; Manekin(a) has one key for all.
      if (element && ELEMENTS[str(skills.get(burst) ?? {}, 'costElemType')] !== element) continue
      const ids = list<number>(depot, 'skills')
      variants.push([
        skillIcon(ids[0] ?? 0),
        skillIcon(ids[1] ?? 0),
        skillIcon(burst),
        // Manekin(a) has no constellations (all six ids are 0).
        ...list<number>(depot, 'talents')
          .filter((t) => t > 0)
          .map((t) => str(talents.get(t) ?? {}, 'icon')),
      ])
    }
    const [first] = variants
    if (!first) {
      problems.error(`${what}: no skill depot${element ? ` for ${element}` : ''}`)
      continue
    }
    if (variants.some((v) => v.join() !== first.join())) {
      problems.error(
        `${what}: skill depots have different icons but there is one GOOD key; pick one in compileImages`,
      )
      continue
    }
    const [attack = '', skill = '', burst = '', ...constellations] = first
    if (!attack || !skill || !burst) {
      problems.error(`${what}: a talent has no skillIcon (${first.slice(0, 3).join(', ')})`)
    }
    if (
      constellations.length > 0 &&
      (constellations.length !== 6 || constellations.some((c) => !c))
    ) {
      problems.error(`${what}: expected 6 constellation icons, got ${constellations.join(', ')}`)
    }
    characters.push([key, [icon, namecardOf(avatar, what), attack, skill, burst, constellations]])
  }

  const traveler = {} as ImagesFile['traveler']
  for (const [gender, icon] of Object.entries(TRAVELER_ICONS) as [
    keyof typeof TRAVELER_ICONS,
    string,
  ][]) {
    if (!inputs.avatars.some((a) => str(a, 'iconName') === icon))
      problems.error(`Traveler: no avatar with iconName ${icon}`)
    traveler[gender] = icon
  }

  // --- weapons --------------------------------------------------------------------
  const weaponRows = new Map(inputs.weapons.map((w) => [num(w, 'id'), w]))
  const weapons: [string, [string, string]][] = []
  for (const [key, id] of planner.weapons) {
    const row = weaponRows.get(id)
    const icon = row ? str(row, 'icon') : ''
    if (!icon) {
      problems.error(`Weapon ${key} (${id}): no icon`)
      continue
    }
    // Some weapons reuse the base art when ascended (no awakenIcon).
    weapons.push([key, [icon, str(row!, 'awakenIcon') || icon]])
  }

  // --- artifact sets ----------------------------------------------------------------
  const affixNames = new Map<number, string>()
  for (const affix of inputs.equipAffixes) {
    const name = inputs.names.get(affix.nameTextMapHash)
    if (name && !affixNames.has(num(affix, 'id'))) affixNames.set(num(affix, 'id'), name)
  }
  const reliquaries = new Map(inputs.reliquaries.map((r) => [num(r, 'id'), r]))
  const artifacts = new Map<string, { setId: number; icons: ImagesFile['artifacts'][string] }>()
  for (const set of inputs.reliquarySets) {
    const setId = num(set, 'setId')
    // Sets without a bonus have no name and can't be in a GOOD export (as irminsul skips them).
    const name = affixNames.get(num(set, 'equipAffixId'))
    if (!name) continue
    const key = context.toGoodKey(name)
    const what = `Artifact set ${key} (${setId})`
    const icons: ImagesFile['artifacts'][string] = ['', '', '', '', '']
    for (const id of list<number>(set, 'containsList')) {
      const piece = reliquaries.get(id)
      if (!piece) {
        problems.error(`${what}: piece ${id} is not in ReliquaryExcelConfigData`)
        continue
      }
      const slot = SLOTS.findIndex(([type]) => type === str(piece, 'equipType'))
      if (slot < 0) {
        problems.error(`${what}: piece ${id} has unknown equipType "${str(piece, 'equipType')}"`)
        continue
      }
      const icon = str(piece, 'icon')
      if (!icon) problems.error(`${what}: piece ${id} has no icon`)
      else if (icons[slot] && icons[slot] !== icon)
        problems.error(`${what}: two ${SLOTS[slot]![1]} icons (${icons[slot]}, ${icon})`)
      else icons[slot] = icon
    }
    if (icons.every((icon) => !icon)) {
      problems.error(`${what}: no piece icons`)
      continue
    }
    const other = artifacts.get(key)
    if (other && other.icons.join() !== icons.join()) {
      problems.error(`${what}: set ${other.setId} makes the same GOOD key with other pieces`)
      continue
    }
    if (!other) artifacts.set(key, { setId, icons })
  }

  // --- items ----------------------------------------------------------------------------
  const items: [string, string][] = []
  for (const key of IMAGE_ITEMS) {
    const entry = context.materials.materials[key]
    if (entry === undefined) problems.error(`Item ${key} is not in the material index`)
    else items.push([key, entryIcon(entry)])
  }

  return {
    columns: {
      characters: CHARACTER_IMAGE_COLUMNS,
      weapons: ['icon', 'awaken'],
      artifacts: SLOTS.map(([, slot]) => slot),
    },
    characters: sortedObject(characters),
    traveler,
    weapons: sortedObject(weapons),
    artifacts: sortedObject([...artifacts].map(([key, { icons }]) => [key, icons])),
    items: sortedObject(items),
  }
}
