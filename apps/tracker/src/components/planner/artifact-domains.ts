/**
 * Artifact domains for the planner, from `@gdt/game-data/farming`: the
 * domains that drop a set, and the order the set picker offers sets in.
 */

import { artifactDomainsFor, type ArtifactDomain, type FarmingData } from '@gdt/game-data/farming'

export type { ArtifactDomain }

const NONE: readonly ArtifactDomain[] = []

/** The domains dropping `setKey` at its top rarity ([] for none, or no farming data yet). */
export function domainsForSet(
  farming: FarmingData | null | undefined,
  setKey: string,
): readonly ArtifactDomain[] {
  return farming ? artifactDomainsFor(farming, setKey) : NONE
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
  for (const d of [...(farming?.artifactDomains ?? NONE)].reverse()) {
    d.sets.forEach((key, i) => {
      if ((d.rarities[i] ?? 5) >= 5) push(key)
    })
  }
  ;[...all].sort((a, b) => name(a).localeCompare(name(b))).forEach(push)
  return out
}
