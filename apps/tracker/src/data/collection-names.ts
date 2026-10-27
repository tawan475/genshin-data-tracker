import type { ArchiveTab, WardrobeKind } from '@gdt/shared'

/**
 * Names (and later icons) of what the Collections tabs list. The game data
 * does not carry them yet: every lookup answers null and the pages show the
 * id instead (`idLabel`). When @gdt/game-data ships them, each function
 * becomes a `load…()` lookup and the pages need no other change.
 *
 * TODO(game-data): Archive entries by tab, Living Beings, Handbook chapters
 * and targets, TCG cards, outfits / gliders / weapon skins / trails, Aranara.
 */

export const archiveName = (_tab: ArchiveTab, _id: number): string | null => null
export const livingBeingName = (_id: number): string | null => null
export const handbookChapterName = (_id: number): string | null => null
export const handbookTargetName = (_questId: number): string | null => null
export const tcgCardName = (_id: number): string | null => null
export const wardrobeItemName = (_kind: WardrobeKind, _id: number): string | null => null
export const aranaraName = (_type: number, _id: number): string | null => null

/** What stands in for a name the game data does not have yet. */
export const idLabel = (id: number): string => `#${id}`

/** A name, else the id. */
export const nameOr = (name: string | null, id: number): string => name ?? idLabel(id)
