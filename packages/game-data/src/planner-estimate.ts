/**
 * Runs, resin and days to farm what the totals still miss, pure and
 * synchronous, from the hand-kept averages in `overrides/drops.json`
 * (`loadDropRates`, wiki-sourced) and the game data's domain tiers, boss
 * levels and resin costs:
 *
 * - talent and weapon domains (20 resin), by entrance: the highest tier the
 *   Adventure Rank opens; tiered families count crafting, so
 *   runs = max over t of ceil(Σ_{k≤t} missing_k·3^(k-1) / Σ_{k≤t} perRun_k·3^(k-1)).
 *   Lower tiers only come from lower drops; higher tiers can be crafted up.
 * - normal bosses (40 resin) and their gems, by World Level;
 * - weekly bosses (30 for the first claims each week, then 60), pooled per
 *   boss since Dream Solvent converts within the trio, with the solvent the
 *   random drops are expected to need; one claim per boss per week;
 * - ley lines (20 resin): character EXP and Mora by World Level, the Mora
 *   left after what the planned domain runs pay out.
 *
 * Nothing is guessed: a source without a rate for the account's bracket is
 * `no-rate`; one the account can't farm yet (AR/WL below the first tier) is
 * `locked`. With AR or WL unknown (null) the top bracket is assumed and the
 * result says so. `domainSchedule` and `todayPlan` sort the domains by day;
 * `resinNow` estimates the resin held now from a snapshot.
 */

import type { DropRates } from './drops'
import type { DomainEntry, DomainTier, PlannerData, WeeklyBoss } from './index'
import { spareOf, type WeeklyBossTotal } from './planner-convert'
import {
  msUntilReset,
  planTotals,
  RESIN_PER_DAY,
  serverWeekday,
  sourceGroups,
  type MaterialLine,
  type PlanGoal,
  type PlanOptions,
  type PlanTotals,
  type SourceGroup,
} from './planner-math'

export interface EstimateOptions {
  /** Adventure Rank; null/undefined: unknown, the top bracket is assumed. */
  ar?: number | null
  /** World Level; null/undefined: unknown, the top bracket is assumed. */
  wl?: number | null
}

/**
 * - `ok`: estimated
 * - `done`: nothing missing
 * - `no-rate`: drops.json has no average for this bracket (no estimate, by design)
 * - `locked`: the account's AR/WL can't farm it yet
 * - `not-farmed`: no resin source (local specialties, enemy drops, crowns,
 *   quest-only weekly materials, Brilliant Diamond)
 */
export type EstimateStatus = 'ok' | 'done' | 'no-rate' | 'locked' | 'not-farmed'

export interface Bracket {
  /** Domain tier (1 = I), weekly boss level, or World Level. */
  kind: 'tier' | 'level' | 'wl'
  value: number
  /** Adventure Rank the bracket needs (domain tiers, weekly boss levels). */
  ar: number | null
  /** AR/WL was unknown: the top bracket was assumed. */
  assumed: boolean
}

export interface RunEstimate {
  runs: number
  /** Original Resin for them (weekly: the discounted price, see `WeeklyRun`). */
  resin: number
  /** Days of regenerated resin (180 a day), rounded up. */
  days: number
  /** The same resin in Condensed Resin, rounded up. */
  condensed: number
  resinPerRun: number
  /** Average per run used: lowest-tier units for tiered families, EXP or Mora for ley lines. */
  perRun: number
  bracket: Bracket
}

export interface FarmGroup extends SourceGroup {
  status: EstimateStatus
  run: RunEstimate | null
  /** The domain entrance (talent books, weapon materials). */
  entry: DomainEntry | null
  /** Missing per tier, lowest first (one entry for single materials). */
  missingByTier: number[]
}

export interface FarmDomain {
  /** `domain:<entry id>` */
  id: string
  entry: DomainEntry
  /** Families of the entrance something needs, in day order. */
  groups: FarmGroup[]
  /** `ok` when every family with something missing has an estimate. */
  status: EstimateStatus
  /** Runs of all its families together. */
  run: RunEstimate | null
  goals: string[]
}

export interface WeeklyRun extends RunEstimate {
  /** One claim per boss per week: weeks = runs. */
  weeks: number
  /** All runs at full price / all at the weekly discount. */
  resinMax: number
  resinMin: number
  /** Dream Solvent the expected drops need converted, and what the runs drop. */
  solvent: { need: number; income: number }
}

export interface FarmWeekly {
  /** `weekly:<boss key>`, or `weekly:unfarmable`. */
  id: string
  /** null for weekly materials no boss drops (quest rewards). */
  boss: WeeklyBoss | null
  lines: MaterialLine[]
  /** The Dream Solvent detail for this boss (null with `solvent: false`). */
  conversion: WeeklyBossTotal | null
  goals: string[]
  need: number
  missing: number
  status: EstimateStatus
  run: WeeklyRun | null
}

export interface WeeklyTotal {
  runs: number
  /** Longest boss: one claim per boss per week. */
  weeks: number
  /** With the weekly discount on the first claims of each week. */
  resin: number
  resinMax: number
  solvent: { need: number; income: number; held: number; short: number }
  /** A boss with something missing has no estimate. */
  partial: boolean
}

export interface FarmLeyLine {
  kind: 'exp' | 'mora'
  /** Character EXP points / Mora still missing. */
  missing: number
  /** Mora the planned domain runs pay (taken off `missing` before counting runs). */
  fromDomains: number
  status: EstimateStatus
  run: RunEstimate | null
}

export interface FarmTotal {
  /**
   * Domains, normal boss materials and ley lines (like Seelie's headline:
   * weekly bosses and gems are separate).
   */
  runs: number
  resin: number
  days: number
  condensed: number
  /** Something farmable is missing without an estimate. */
  partial: boolean
  /** Sources the account's AR/WL can't farm yet. */
  locked: number
  /** Normal boss runs for gems (not in `resin`). */
  gems: { runs: number; resin: number }
}

export interface FarmPlan {
  /** Per family or material (no weekly: see `weekly`), like `sourceGroups`, with estimates. */
  groups: FarmGroup[]
  /** Domain entrances with something needed (talent first). */
  domains: FarmDomain[]
  /** Weekly bosses with something needed, then quest-only weekly materials. */
  weekly: FarmWeekly[]
  weeklyTotal: WeeklyTotal
  leyLines: { exp: FarmLeyLine; mora: FarmLeyLine }
  total: FarmTotal
  /** AR / WL unknown: top brackets assumed. */
  assumed: { ar: boolean; wl: boolean }
}

// --- Rates --------------------------------------------------------------------

/**
 * Runs to farm a tiered family: missing per tier and average drops per run
 * per tier (lowest first). Crafting climbs (3 -> 1), so each prefix of tiers
 * must be covered by the drops of that prefix:
 * max over t of Σ_{k≤t} m_k·3^(k-1) / Σ_{k≤t} d_k·3^(k-1), rounded up.
 * Infinity when a tier is missing and nothing at or below it drops.
 * Without crafting (`craftable` false) each tier stands alone.
 */
export function tieredRuns(
  missing: readonly number[],
  perRun: readonly number[],
  craftable = true,
): number {
  let runs = 0
  let need = 0
  let rate = 0
  missing.forEach((m, t) => {
    const weight = craftable ? 3 ** t : 1
    const d = perRun[t] ?? 0
    if (craftable) {
      need += m * weight
      rate += d * weight
    } else {
      need = m
      rate = d
    }
    if (need <= 0) return
    runs = Math.max(runs, rate > 0 ? need / rate : Infinity)
  })
  // Tolerate float noise (2.2 * 5 = 11.000000000000002).
  return Number.isFinite(runs) ? Math.ceil(runs - 1e-9) : Infinity
}

/** The highest domain tier the Adventure Rank opens; null when it opens none. */
export function domainTierFor(
  entry: DomainEntry,
  ar: number | null | undefined,
): DomainTier | null {
  if (ar === null || ar === undefined) return entry.tiers.at(-1) ?? null
  return entry.tiers.filter((t) => t.ar <= ar).at(-1) ?? null
}

/** The highest weekly boss level the Adventure Rank opens that drops its materials; null when none. */
export function weeklyTierFor(
  boss: WeeklyBoss,
  ar: number | null | undefined,
): { ar: number; level: number } | null {
  if (ar === null || ar === undefined) return boss.tiers.at(-1) ?? null
  return boss.tiers.filter((t) => t.ar <= ar).at(-1) ?? null
}

/** A value by World Level: the row for `wl`, the top row when unknown. */
function byWorldLevel<T>(
  rows: ReadonlyMap<number, T>,
  wl: number | null | undefined,
): { row: T | null; wl: number; locked: boolean; assumed: boolean } {
  const levels = [...rows.keys()].sort((a, b) => a - b)
  if (levels.length === 0) return { row: null, wl: wl ?? 0, locked: false, assumed: wl == null }
  if (wl === null || wl === undefined) {
    const top = levels.at(-1)!
    return { row: rows.get(top) ?? null, wl: top, locked: false, assumed: true }
  }
  return {
    row: rows.get(wl) ?? null,
    wl,
    locked: wl < levels[0]!,
    assumed: false,
  }
}

function estimate(
  runs: number,
  resinPerRun: number,
  perRun: number,
  bracket: Bracket,
  condensedResin: number,
): RunEstimate {
  const resin = runs * resinPerRun
  return {
    runs,
    resin,
    days: Math.ceil(resin / RESIN_PER_DAY),
    condensed: condensedResin > 0 ? Math.ceil(resin / condensedResin) : 0,
    resinPerRun,
    perRun,
    bracket,
  }
}

function sumRuns(runs: readonly RunEstimate[], condensedResin: number): RunEstimate | null {
  const first = runs[0]
  if (!first) return null
  const total = runs.reduce((sum, r) => sum + r.runs, 0)
  const resin = runs.reduce((sum, r) => sum + r.resin, 0)
  return {
    runs: total,
    resin,
    days: Math.ceil(resin / RESIN_PER_DAY),
    condensed: condensedResin > 0 ? Math.ceil(resin / condensedResin) : 0,
    resinPerRun: first.resinPerRun,
    perRun: first.perRun,
    bracket: first.bracket,
  }
}

const cumulative = (perRun: readonly number[]) => perRun.reduce((sum, d, t) => sum + d * 3 ** t, 0)

// --- The plan ----------------------------------------------------------------------

/**
 * Estimates for everything `totals` still misses. `drops` null (not loaded)
 * gives statuses without runs.
 */
export function farmPlan(
  planner: PlannerData,
  totals: PlanTotals,
  drops: DropRates | null,
  options: EstimateOptions = {},
): FarmPlan {
  const ar = options.ar ?? null
  const wl = options.wl ?? null
  const condensedResin =
    planner.resin.items.find((i) => i.key === planner.resin.condensed.key)?.resin ?? 0
  const assumed = { ar: false, wl: false }

  // Families and single materials, weekly aside.
  const groups: FarmGroup[] = sourceGroups(totals)
    .filter((g) => g.kind !== 'weekly')
    .map((g): FarmGroup => {
      const family = g.lines[0]?.material.family ?? null
      const missingByTier = family
        ? family.members.map((m) => totals.lines.get(m.key)?.missing ?? 0)
        : [g.missing]
      const group: FarmGroup = {
        ...g,
        status: 'done',
        run: null,
        entry: family ? (planner.domainOf.get(family.key) ?? null) : null,
        missingByTier,
      }
      if (g.missing === 0) return group
      if (g.kind === 'local' || g.kind === 'enemy' || g.kind === 'crown') {
        group.status = 'not-farmed'
        return group
      }
      if (g.kind === 'talent' || g.kind === 'weapon') {
        const entry = group.entry
        const tier = entry ? domainTierFor(entry, ar) : null
        if (!entry || !tier) {
          group.status = entry ? 'locked' : 'no-rate'
          return group
        }
        if (ar === null) assumed.ar = true
        const rate = drops?.domains[entry.kind].tiers.get(tier.tier)
        if (!rate) {
          group.status = 'no-rate'
          return group
        }
        const runs = tieredRuns(missingByTier, rate.perRun)
        if (!Number.isFinite(runs)) {
          group.status = 'locked'
          return group
        }
        group.run = estimate(
          runs,
          tier.resin,
          cumulative(rate.perRun),
          { kind: 'tier', value: tier.tier, ar: tier.ar, assumed: ar === null },
          condensedResin,
        )
      } else if (g.kind === 'boss' || g.kind === 'gem') {
        if (g.kind === 'gem' && !(family && planner.azoth.families.has(family.key))) {
          // Brilliant Diamond: no boss drops it.
          group.status = 'not-farmed'
          return group
        }
        const pick = byWorldLevel(drops?.bosses.byWorldLevel ?? new Map(), wl)
        if (pick.assumed) assumed.wl = true
        const perTier =
          g.kind === 'boss' ? (pick.row?.boss ? [pick.row.boss] : null) : pick.row?.gems
        const resin = drops?.bosses.resin ?? null
        if (pick.locked) {
          group.status = 'locked'
          return group
        }
        if (!perTier || !resin) {
          group.status = 'no-rate'
          return group
        }
        const runs = tieredRuns(missingByTier, perTier, g.kind === 'gem')
        if (!Number.isFinite(runs)) {
          group.status = 'locked'
          return group
        }
        group.run = estimate(
          runs,
          resin,
          g.kind === 'gem' ? cumulative(perTier) : perTier[0]!,
          { kind: 'wl', value: pick.wl, ar: null, assumed: pick.assumed },
          condensedResin,
        )
      }
      group.status = group.run ? 'ok' : 'no-rate'
      if (group.run) group.estimate = { runs: group.run.runs, resin: group.run.resin }
      return group
    })

  // Domains by entrance.
  const domains: FarmDomain[] = []
  for (const entry of planner.domains) {
    const own = groups.filter((g) => g.entry === entry)
    if (own.length === 0) continue
    own.sort(
      (a, b) =>
        entry.families.findIndex((f) => f.key === a.key) -
        entry.families.findIndex((f) => f.key === b.key),
    )
    const short = own.filter((g) => g.missing > 0)
    const runs = short.map((g) => g.run).filter((r): r is RunEstimate => r !== null)
    const statuses = new Set(short.map((g) => g.status))
    domains.push({
      id: `domain:${entry.entry}`,
      entry,
      groups: own,
      status:
        short.length === 0
          ? 'done'
          : statuses.has('locked')
            ? 'locked'
            : statuses.has('no-rate')
              ? 'no-rate'
              : 'ok',
      run: sumRuns(runs, condensedResin),
      goals: [...new Set(own.flatMap((g) => g.goals))],
    })
  }
  domains.sort(
    (a, b) =>
      Number(a.entry.kind === 'weapon') - Number(b.entry.kind === 'weapon') ||
      Number(b.status !== 'done') - Number(a.status !== 'done') ||
      a.entry.entry - b.entry.entry,
  )

  const weekly = weeklyPlan(planner, totals, drops, ar, wl, condensedResin, assumed)
  const weeklyTotal = weeklySum(weekly.list, drops, weekly.held)

  // Ley lines: EXP and the Mora the domain runs don't pay.
  const domainMora = groups.reduce((sum, g) => {
    const tier = g.entry && g.run ? domainTierFor(g.entry, ar) : null
    return sum + (tier && g.run ? tier.mora * g.run.runs : 0)
  }, 0)
  const pick = byWorldLevel(drops?.leyLines.byWorldLevel ?? new Map(), wl)
  const leyLine = (kind: 'exp' | 'mora', missing: number, fromDomains: number): FarmLeyLine => {
    const left = Math.max(0, missing - fromDomains)
    const line: FarmLeyLine = { kind, missing, fromDomains, status: 'done', run: null }
    if (left === 0) return line
    if (pick.assumed) assumed.wl = true
    const perRun = pick.row?.[kind] ?? null
    const resin = planner.resin.leyLine
    if (pick.locked) line.status = 'locked'
    else if (!perRun || !resin) line.status = 'no-rate'
    else {
      line.status = 'ok'
      line.run = estimate(
        Math.ceil(left / perRun - 1e-9),
        resin,
        perRun,
        { kind: 'wl', value: pick.wl, ar: null, assumed: pick.assumed },
        condensedResin,
      )
    }
    return line
  }
  const leyLines = {
    exp: leyLine('exp', totals.characterExp.missing, 0),
    mora: leyLine('mora', totals.mora.missing, Math.min(domainMora, totals.mora.missing)),
  }

  // Headline: domains, normal boss materials, ley lines.
  const counted = [
    ...groups.filter((g) => g.kind === 'talent' || g.kind === 'weapon' || g.kind === 'boss'),
  ]
  const headline = [...counted.map((g) => g.run), leyLines.exp.run, leyLines.mora.run].filter(
    (r): r is RunEstimate => r !== null,
  )
  const resin = headline.reduce((sum, r) => sum + r.resin, 0)
  const gemRuns = groups.filter((g) => g.kind === 'gem' && g.run).map((g) => g.run!)
  const total: FarmTotal = {
    runs: headline.reduce((sum, r) => sum + r.runs, 0),
    resin,
    days: Math.ceil(resin / RESIN_PER_DAY),
    condensed: condensedResin > 0 ? Math.ceil(resin / condensedResin) : 0,
    partial:
      counted.some((g) => g.status === 'no-rate') ||
      leyLines.exp.status === 'no-rate' ||
      leyLines.mora.status === 'no-rate',
    locked:
      [...groups, ...weekly.list].filter((g) => g.status === 'locked').length +
      Number(leyLines.exp.status === 'locked') +
      Number(leyLines.mora.status === 'locked'),
    gems: {
      runs: gemRuns.reduce((sum, r) => sum + r.runs, 0),
      resin: gemRuns.reduce((sum, r) => sum + r.resin, 0),
    },
  }
  return { groups, domains, weekly: weekly.list, weeklyTotal, leyLines, total, assumed }
}

function weeklyPlan(
  planner: PlannerData,
  totals: PlanTotals,
  drops: DropRates | null,
  ar: number | null,
  wl: number | null,
  condensedResin: number,
  assumed: { ar: boolean; wl: boolean },
): { list: FarmWeekly[]; held: number } {
  const list: FarmWeekly[] = []
  const w = drops?.weekly
  for (const boss of planner.weeklyBosses) {
    const lines = boss.items
      .map((m) => totals.lines.get(m.key))
      .filter((l): l is MaterialLine => l !== undefined)
    if (!lines.some((l) => l.need > 0)) continue
    const conversion = totals.solvent?.bosses.find((b) => b.boss === boss) ?? null
    const need = lines.reduce((sum, l) => sum + l.need, 0)
    const missing = lines.reduce((sum, l) => sum + l.missing, 0)
    const entry: FarmWeekly = {
      id: `weekly:${boss.key}`,
      boss,
      lines,
      conversion,
      goals: [...new Set(lines.flatMap((l) => l.goals))],
      need,
      missing,
      status: missing === 0 ? 'done' : 'no-rate',
      run: null,
    }
    list.push(entry)
    if (missing === 0) continue

    // Rate: by boss level for domain bosses, by World Level for the others.
    let perRun: number | null = null
    let bracket: Bracket | null = null
    if (boss.tiers.length > 0) {
      const tier = weeklyTierFor(boss, ar)
      if (!tier) {
        entry.status = 'locked'
        continue
      }
      if (ar === null) assumed.ar = true
      perRun = w?.byLevel.get(tier.level) ?? null
      bracket = { kind: 'level', value: tier.level, ar: tier.ar, assumed: ar === null }
    } else {
      const pick = byWorldLevel(w?.byWorldLevel.get(boss.key) ?? new Map<number, number>(), wl)
      if (pick.assumed) assumed.wl = true
      if (pick.locked) {
        entry.status = 'locked'
        continue
      }
      perRun = pick.row
      bracket = { kind: 'wl', value: pick.wl, ar: null, assumed: pick.assumed }
    }
    if (!perRun || !bracket || !w?.resin) continue

    // Pooled: spares left (conversions the solvent blocked) cover shortage without runs.
    const spareLeft = lines.reduce((sum, l) => sum + spareOf(l), 0)
    const short = lines.map((l) => l.missing)
    let fill = spareLeft
    for (const i of short.map((_, i) => i).sort((a, b) => short[b]! - short[a]!)) {
      const n = Math.min(fill, short[i]!)
      short[i] = short[i]! - n
      fill -= n
    }
    const itemsShort = short.reduce((sum, s) => sum + s, 0)
    const runs = Math.ceil(itemsShort / perRun - 1e-9)
    // Drops land on a random material of the trio (a third each on average);
    // what an item still lacks is converted from the others.
    const conversions =
      Math.min(spareLeft, missing) +
      short.reduce((sum, s) => sum + Math.max(0, s - (runs * perRun) / 3), 0)
    const discount = w.discountResin ?? w.resin
    const run: WeeklyRun = {
      ...estimate(runs, discount, perRun, bracket, condensedResin),
      weeks: runs,
      resinMax: runs * w.resin,
      resinMin: runs * discount,
      solvent: {
        need: Math.round(conversions * boss.solvent * 100) / 100,
        income: Math.round(runs * (w.solvent ?? 0) * 100) / 100,
      },
    }
    entry.run = run
    entry.status = 'ok'
  }
  // Quest-only weekly materials.
  const unfarmable = [...planner.unfarmable]
    .map((key) => totals.lines.get(key))
    .filter((l): l is MaterialLine => l !== undefined && l.need > 0)
  if (unfarmable.length > 0) {
    const missing = unfarmable.reduce((sum, l) => sum + l.missing, 0)
    list.push({
      id: 'weekly:unfarmable',
      boss: null,
      lines: unfarmable,
      conversion: null,
      goals: [...new Set(unfarmable.flatMap((l) => l.goals))],
      need: unfarmable.reduce((sum, l) => sum + l.need, 0),
      missing,
      status: missing === 0 ? 'done' : 'not-farmed',
      run: null,
    })
  }
  // Solvent left after the conversions made (unknown without them: 0).
  const solvent = totals.solvent
  const held = solvent ? Math.max(0, solvent.have - solvent.used) : 0
  return { list, held }
}

function weeklySum(
  list: readonly FarmWeekly[],
  drops: DropRates | null,
  held: number,
): WeeklyTotal {
  const runs = list.map((b) => b.run?.runs ?? 0).filter((n) => n > 0)
  const weeks = Math.max(0, ...runs)
  const w = drops?.weekly
  const full = w?.resin ?? 0
  const cheap = w?.discountResin ?? full
  const discounts = w?.discounts ?? 0
  let resin = 0
  for (let week = 1; week <= weeks; week++) {
    const claims = runs.filter((n) => n >= week).length
    resin += Math.min(claims, discounts) * cheap + Math.max(0, claims - discounts) * full
  }
  const need = list.reduce((sum, b) => sum + (b.run?.solvent.need ?? 0), 0)
  const income = list.reduce((sum, b) => sum + (b.run?.solvent.income ?? 0), 0)
  return {
    runs: runs.reduce((a, b) => a + b, 0),
    weeks,
    resin,
    resinMax: runs.reduce((a, b) => a + b, 0) * full,
    solvent: {
      need: Math.round(need * 100) / 100,
      income: Math.round(income * 100) / 100,
      held,
      short: Math.max(0, Math.round((need - income - held) * 100) / 100),
    },
    partial: list.some((b) => b.status === 'no-rate'),
  }
}

/**
 * Totals and estimates for one goal on its own (the goal editor's
 * "resin · days" next to its cost). The goal counts as active.
 */
export function goalEstimate(
  planner: PlannerData,
  goal: PlanGoal,
  inventory: Readonly<Record<string, number>>,
  drops: DropRates | null,
  options: PlanOptions & EstimateOptions = {},
): FarmPlan {
  const totals = planTotals(planner, [{ ...goal, active: true }], inventory, options)
  return farmPlan(planner, totals, drops, options)
}

// --- Days -----------------------------------------------------------------------

export interface ScheduledDomain {
  domain: FarmDomain
  /** The entrance's families open these days that something needs. */
  groups: FarmGroup[]
  run: RunEstimate | null
}

export interface DaySchedule {
  /** The pair (0 = Sunday, as Date#getDay): [1, 4], [2, 5] or [3, 6]. */
  days: number[]
  domains: ScheduledDomain[]
  /** Runs of the pair's families together. */
  run: RunEstimate | null
}

/** A domain family's day pair: its weekdays without Sunday. */
const pairOf = (weekdays: readonly number[]) => weekdays.filter((d) => d !== 0)

/**
 * The domains by day pair (Mon/Thu, Tue/Fri, Wed/Sat), each with only the
 * families open those days and their runs. Everything is open on Sunday.
 */
export function domainSchedule(plan: FarmPlan): DaySchedule[] {
  const condensedOf = (r: RunEstimate) =>
    r.resin > 0 && r.condensed > 0 ? r.resin / r.condensed : 0
  return [
    [1, 4],
    [2, 5],
    [3, 6],
  ].map((days) => {
    const domains: ScheduledDomain[] = []
    for (const domain of plan.domains) {
      const groups = domain.groups.filter((g) => pairOf(g.weekdays).join() === days.join())
      if (groups.length === 0) continue
      const runs = groups.map((g) => g.run).filter((r): r is RunEstimate => r !== null)
      const first = runs[0]
      domains.push({ domain, groups, run: sumRuns(runs, first ? condensedOf(first) : 0) })
    }
    const all = domains.map((d) => d.run).filter((r): r is RunEstimate => r !== null)
    const first = all[0]
    return { days, domains, run: sumRuns(all, first ? condensedOf(first) : 0) }
  })
}

export interface TodayPlan {
  /** Game day on the server (0 = Sunday). */
  weekday: number
  /** Sunday: every domain is open. */
  allOpen: boolean
  /** Entrances open today with something needed, and only today's families. */
  domains: ScheduledDomain[]
  /** Runs of today's families together. */
  run: RunEstimate | null
  /** Until the 04:00 server reset. */
  msUntilReset: number
}

/** What today's open domains can farm toward the plan. */
export function todayPlan(
  plan: FarmPlan,
  now: number,
  server: string | null | undefined,
): TodayPlan {
  const weekday = serverWeekday(now, server)
  const domains: ScheduledDomain[] = []
  for (const domain of plan.domains) {
    const groups = domain.groups.filter((g) => g.missing > 0 && g.weekdays.includes(weekday))
    if (groups.length === 0) continue
    const runs = groups.map((g) => g.run).filter((r): r is RunEstimate => r !== null)
    const first = runs[0]
    domains.push({
      domain,
      groups,
      run: sumRuns(runs, first && first.condensed > 0 ? first.resin / first.condensed : 0),
    })
  }
  const all = domains.map((d) => d.run).filter((r): r is RunEstimate => r !== null)
  const first = all[0]
  return {
    weekday,
    allOpen: weekday === 0,
    domains,
    run: sumRuns(all, first && first.condensed > 0 ? first.resin / first.condensed : 0),
    msUntilReset: msUntilReset(now, server),
  }
}

// --- Resin ---------------------------------------------------------------------------

/** Original Resin's natural cap and regeneration (game rules, not in the data). */
export const RESIN_MAX = 200
export const RESIN_MINUTES = 8

export interface ResinNow {
  /** The count is known: irminsul's `gi_player.resin`, or an `OriginalResin` material count. */
  known: boolean
  /** Where the count came from. */
  source: 'player' | 'inventory'
  /** The count, as of `at`. */
  atSnapshot: number
  /** When the count was read (ms since epoch): the login for irminsul's, else the snapshot. */
  at: number
  /** Estimated now: regenerated one per 8 minutes up to 200 (more only from refills). */
  original: number
  /** When it reaches 200 (ms since epoch); null when it already has. */
  fullAt: number | null
  /** Resin held in items (Fragile, Transient, Condensed: 60 each). */
  bag: number
  items: { key: string; count: number; resin: number }[]
  /** original + bag */
  total: number
}

/** irminsul's Original Resin and when the game sent it (see `accountPlayer`). */
export interface LoginResin {
  value: number
  at: number
}

/**
 * The resin an account has now, from its newest snapshot taken at `takenAt`
 * (ms). irminsul's `gi_player.resin`, when given, is preferred over the
 * material count, and regenerates from the time it was read.
 */
export function resinNow(
  planner: PlannerData,
  inventory: Readonly<Record<string, number>>,
  takenAt: number,
  now: number,
  login: LoginResin | null = null,
): ResinNow {
  const count = (key: string) => Math.max(0, Math.trunc(inventory[key] ?? 0))
  const known =
    login !== null || (planner.resin.original !== '' && planner.resin.original in inventory)
  const atSnapshot = login ? Math.max(0, Math.trunc(login.value)) : count(planner.resin.original)
  const at = login ? login.at : takenAt
  const step = RESIN_MINUTES * 60_000
  const regenerated = Math.max(0, Math.floor((now - at) / step))
  const original =
    atSnapshot >= RESIN_MAX ? atSnapshot : Math.min(RESIN_MAX, atSnapshot + regenerated)
  const fullAt = atSnapshot >= RESIN_MAX || !known ? null : at + (RESIN_MAX - atSnapshot) * step
  const items = planner.resin.items
    .map((i) => ({ key: i.key, count: count(i.key), resin: i.resin }))
    .filter((i) => i.count > 0)
  const bag = items.reduce((sum, i) => sum + i.count * i.resin, 0)
  return {
    known,
    source: login ? 'player' : 'inventory',
    atSnapshot,
    at,
    original,
    fullAt: fullAt !== null && fullAt <= now ? null : fullAt,
    bag,
    items,
    total: original + bag,
  }
}

/** Days of regenerated resin `resin` takes when `available` is already held. */
export function daysFor(resin: number, available = 0): number {
  return Math.ceil(Math.max(0, resin - Math.max(0, available)) / RESIN_PER_DAY)
}
