import artifactSetKeys from './data/artifactSets.json'

/**
 * Key lists the compact artifact catalog (codec/catalog-binary.ts) stores
 * positions in. All are append-only: a stored position must keep meaning the
 * same key. A key missing from a list is stored spelled out, so new game
 * content never fails to store.
 *
 * Artifact sets grow with the game: append them with
 * `pnpm --filter @gdt/shared dictionary --artifactSet sets.json`.
 */
export const ARTIFACT_SETS: readonly string[] = artifactSetKeys

export const SLOT_KEYS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const

/** Substat keys; a packed substat has 4 bits for its index (15 means spelled out). */
export const SUBSTAT_KEYS = [
  'hp',
  'hp_',
  'atk',
  'atk_',
  'def',
  'def_',
  'eleMas',
  'enerRech_',
  'critRate_',
  'critDMG_',
] as const

/** Main stat keys (any stat a main stat can be). */
export const STAT_KEYS = [
  'hp',
  'hp_',
  'atk',
  'atk_',
  'def',
  'def_',
  'eleMas',
  'enerRech_',
  'critRate_',
  'critDMG_',
  'heal_',
  'physical_dmg_',
  'anemo_dmg_',
  'geo_dmg_',
  'electro_dmg_',
  'hydro_dmg_',
  'pyro_dmg_',
  'cryo_dmg_',
  'dendro_dmg_',
] as const
