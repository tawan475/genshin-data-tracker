/**
 * Checks overrides/drops.json with the app's own parser (src/drops.ts) and
 * compares it with the game data: the domain tiers and weekly boss levels
 * that exist, and the averages the game itself previews.
 */

import { parseDropRates } from '../../src/drops.ts'
import type { PlannerFile } from '../../src/format.ts'
import type { CompiledFarming } from '../compile/farming.ts'
import type { Problems } from './problems.ts'

const close = (a: number, b: number) => Math.abs(a - b) < 0.005

export function checkDrops(
  json: unknown,
  planner: PlannerFile,
  checks: CompiledFarming['checks'],
  problems: Problems,
): void {
  const { rates, problems: invalid } = parseDropRates(json)
  for (const message of invalid) problems.error(`overrides/drops.json: ${message}`)

  // Domains: a rate per tier the game has; the wiki's first roll = the game's preview.
  for (const kind of ['talent', 'weapon'] as const) {
    const domains = planner.domains.filter((d) => d[1] === kind)
    const tiers = domains[0]?.[4] ?? []
    const drops = rates.domains[kind].tiers
    tiers.forEach(([ar, , , preview], i) => {
      const tier = i + 1
      const rate = drops.get(tier)
      if (!rate) {
        problems.warn(
          `overrides/drops.json has no ${kind} domain tier ${tier} (AR ${ar}): no estimate at that AR`,
        )
        return
      }
      const families = domains[0]?.[3][0]
      const length = planner.families.find((f) => f[0] === families)?.[2].length ?? 0
      if (rate.perRun.length > length) {
        problems.error(
          `overrides/drops.json domains.${kind} tier ${tier} lists ${rate.perRun.length} material tiers; the family has ${length}`,
        )
      }
      if (rate.firstRoll !== null && preview > 0 && !close(rate.firstRoll, preview)) {
        problems.warn(
          `overrides/drops.json domains.${kind} tier ${tier}: the wiki's first roll is ${rate.firstRoll}, ` +
            `the game previews ${preview} — the drop rates may have changed; re-check the wiki`,
        )
      }
      if (rate.firstRoll !== null && rate.perRun[0]! + 1e-9 < rate.firstRoll) {
        problems.error(
          `overrides/drops.json domains.${kind} tier ${tier}: the lowest tier's average ${rate.perRun[0]} is below its first roll ${rate.firstRoll}`,
        )
      }
    })
    for (const tier of drops.keys()) {
      if (tier > tiers.length)
        problems.warn(
          `overrides/drops.json domains.${kind} tier ${tier}: the game has ${tiers.length} tiers`,
        )
    }
  }

  // Weekly bosses: a rate for every boss level that drops a trio.
  const levels = new Set(planner.weeklyBosses.flatMap((b) => b[3].map(([, level]) => level)))
  for (const level of [...levels].sort((a, b) => a - b)) {
    if (!rates.weekly.byLevel.has(level))
      problems.warn(
        `overrides/drops.json weekly.byLevel has no boss level ${level}: no weekly estimate there`,
      )
  }
  const keyOf = new Map(planner.materials.map((m) => [m[0], m[1]]))
  for (const [items, , name, tiers] of planner.weeklyBosses) {
    const key = keyOf.get(items[0]!) ?? ''
    if (tiers.length === 0 && !rates.weekly.byWorldLevel.has(key))
      problems.warn(
        `overrides/drops.json weekly.byWorldLevel has no "${key}" (${name}): no estimate for it`,
      )
  }
  for (const key of rates.weekly.byWorldLevel.keys()) {
    const boss = planner.weeklyBosses.find((b) => keyOf.get(b[0][0]!) === key)
    if (!boss)
      problems.error(
        `overrides/drops.json weekly.byWorldLevel.${key} is no weekly trio's first material`,
      )
    else if (boss[3].length > 0)
      problems.warn(
        `overrides/drops.json weekly.byWorldLevel.${key}: ${boss[2]} is a domain boss (uses byLevel)`,
      )
  }
  const solvent = rates.weekly.solvent
  if (solvent !== null && checks.solventPerRun.some((game) => !close(game, solvent))) {
    problems.warn(
      `overrides/drops.json weekly.solvent is ${solvent}, the game previews ${checks.solventPerRun.join('/')} Dream Solvent per claim`,
    )
  }
  if (rates.weekly.discountResin !== null && rates.weekly.resin !== null) {
    if (rates.weekly.discountResin > rates.weekly.resin)
      problems.error('overrides/drops.json weekly.discountResin is above weekly.resin')
  }

  // Normal bosses: gems have at most as many tiers as a gem family.
  for (const row of rates.bosses.byWorldLevel.values()) {
    if ((row.gems?.length ?? 0) > 4)
      problems.error(`overrides/drops.json bosses WL ${row.wl}: more than 4 gem tiers`)
  }
}
