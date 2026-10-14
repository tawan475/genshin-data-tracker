import type {
  ArtifactDomain,
  EnemyGroup,
  FarmingData,
  LocalSpecialty,
  NormalBoss,
  Region,
} from '@gdt/game-data/farming'
import { gameName } from './game-names'
import { locale } from './locale'

/**
 * The farming data (`@gdt/game-data/farming`: bosses, enemy groups, regions,
 * artifact domains, local specialties' areas) with its names in the language
 * on screen, from the game's own text; English is the data as is. Built in a
 * computed: it reads the language, so a switch rebuilds it. Ids and keys are
 * unchanged, so lookups by key behave the same in every language.
 */
export function localizeFarming(data: FarmingData): FarmingData {
  if (locale.value === 'en') return data

  const region = (r: Region | null): Region | null =>
    r ? { ...r, name: gameName('regions', r.id, r.name) } : null
  const monsters = (list: readonly string[]) => list.map((name) => gameName('monsters', name, name))

  const regions = new Map<Region, Region>(data.regions.map((r) => [r, region(r)!]))
  const regionOf = (r: Region | null) => (r ? (regions.get(r) ?? region(r)) : null)
  const bosses = new Map<NormalBoss, NormalBoss>(
    data.bosses.map((b) => [
      b,
      { ...b, name: gameName('bosses', b.id, b.name), monsters: monsters(b.monsters) },
    ]),
  )
  const enemies = new Map<EnemyGroup, EnemyGroup>(
    data.enemies.map((e) => [
      e,
      { ...e, name: gameName('enemies', e.id, e.name), monsters: monsters(e.monsters) },
    ]),
  )
  const local = new Map<LocalSpecialty, LocalSpecialty>(
    data.local.map((l) => [
      l,
      {
        ...l,
        region: regionOf(l.region),
        areas: l.areas.map((a) => gameName('areas', a, a)),
        hints: l.hints.map((h) => gameName('hints', h, h)),
      },
    ]),
  )
  const domains = new Map<ArtifactDomain, ArtifactDomain>(
    data.artifactDomains.map((d) => [
      d,
      { ...d, name: gameName('artifactDomains', d.id, d.name), region: regionOf(d.region) },
    ]),
  )

  const remap = <K, V>(source: ReadonlyMap<K, readonly V[]>, to: Map<V, V>) =>
    new Map([...source].map(([key, list]) => [key, list.map((v) => to.get(v) ?? v)]))

  return {
    regions: [...regions.values()],
    bosses: [...bosses.values()],
    enemies: [...enemies.values()],
    local: [...local.values()],
    bossesOf: remap(data.bossesOf, bosses),
    gemBossesOf: remap(data.gemBossesOf, bosses),
    enemiesOf: remap(data.enemiesOf, enemies),
    localOf: new Map([...data.localOf].map(([key, l]) => [key, local.get(l) ?? l])),
    artifactDomains: [...domains.values()],
    artifactDomainsOf: remap(data.artifactDomainsOf, domains),
  }
}
