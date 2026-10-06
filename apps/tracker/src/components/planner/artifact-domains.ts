/**
 * Artifact set -> the domains that drop it, from `@gdt/game-data/farming`
 * (`artifactDomainsOf`, game data 7.1.2 and later). Read through this one
 * place so the planner still builds against older game data, which has no
 * artifact domains (every set then reads as "no domain").
 */

import type { FarmingData, Region } from '@gdt/game-data/farming'

/** An artifact domain entrance (the game data's `ArtifactDomain`). */
export interface ArtifactDomainInfo {
  /** DungeonEntry id. */
  id: number
  /** Entrance name, as the map shows it ("Midsummer Courtyard"). */
  name: string
  region: Region | null
  /** Adventure Rank of its first tier. */
  ar: number
  /** Original Resin a run costs. */
  resin: number
  /** Sets it drops at their top rarity (GOOD keys), 5★ first. */
  sets: readonly string[]
  /** The rarity of each of `sets`. */
  rarities?: readonly number[]
}

interface WithArtifactDomains {
  artifactDomains?: readonly ArtifactDomainInfo[]
  artifactDomainsOf?: ReadonlyMap<string, readonly ArtifactDomainInfo[]>
}

const NONE: readonly ArtifactDomainInfo[] = []

/** The domains dropping `setKey` at its top rarity ([] for none, or older game data). */
export function domainsForSet(
  farming: FarmingData | null | undefined,
  setKey: string,
): readonly ArtifactDomainInfo[] {
  return (farming as WithArtifactDomains | null | undefined)?.artifactDomainsOf?.get(setKey) ?? NONE
}

/**
 * Sets in the order a picker offers them: the ones `first` names (worn
 * now), then the 5★ sets of the domains, newest domain first, then the rest
 * by name.
 */
export function setPickerOrder(
  farming: FarmingData | null | undefined,
  all: readonly string[],
  name: (key: string) => string,
  first: readonly string[] = [],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (key: string) => {
    if (!seen.has(key) && all.includes(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  first.forEach(push)
  for (const d of [...artifactDomains(farming)].reverse()) {
    d.sets.forEach((key, i) => {
      if ((d.rarities?.[i] ?? 5) >= 5) push(key)
    })
  }
  ;[...all].sort((a, b) => name(a).localeCompare(name(b))).forEach(push)
  return out
}

/** Every artifact domain, in the game data's order ([] for older game data). */
export function artifactDomains(
  farming: FarmingData | null | undefined,
): readonly ArtifactDomainInfo[] {
  return (farming as WithArtifactDomains | null | undefined)?.artifactDomains ?? NONE
}
