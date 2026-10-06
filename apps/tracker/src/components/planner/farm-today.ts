/**
 * What to farm, Seelie's way: cards grouped by what a run costs in Original
 * Resin (nothing, 20, 40, a weekly boss's 30/60), only for what the goals
 * still miss, each with its runs, resin, Condensed Resin and days and the
 * goals that need it. Domains open on their days on the account's server
 * (the day turns at 04:00 server time; on Sunday every domain is open):
 * Today shows today's, the Schedule the other day pairs.
 *
 * Built on the estimates of `@gdt/game-data/planner-estimate` (`farmPlan`);
 * this file only regroups them for the page and counts days with the daily
 * resin refreshes the account spends. Pure; the Farm view keeps the results
 * in computed()s.
 *
 * Who and where come from `@gdt/game-data/farming` (`FarmInput.farming`):
 * a boss card is named after its boss, and a gem a single-element boss on a
 * card drops joins that card (one run drops both); other gems get a card
 * named after the bosses dropping them, single-element ones first. Common
 * and elite drops get a card per enemy, local specialties one per region
 * (the areas they grow in underneath). Without that data (still loading, or
 * failed) the cards list their items without a place. World Level 9 boss
 * estimates are upper bounds ("at most N runs").
 *
 * Artifacts: the domains of the sets the counted goals still want, with who
 * wants them (20 resin a run, no run estimate: artifacts are luck).
 */

import type { DomainEntry, DomainKind, PlannerData } from '@gdt/game-data'
import type { DropRates } from '@gdt/game-data/drops'
import type { EnemyGroup, FarmingData, NormalBoss } from '@gdt/game-data/farming'
import {
  domainTierFor,
  weeklyTierFor,
  type Bracket,
  type EstimateStatus,
  type FarmDomain,
  type FarmGroup,
  type FarmLeyLine,
  type FarmPlan,
  type FarmWeekly,
  type RunEstimate,
} from '@gdt/game-data/planner-estimate'
import {
  RESIN_PER_DAY,
  msUntilReset,
  serverWeekday,
  type ExpTotal,
  type MaterialLine,
  type PlanTotals,
} from '@gdt/game-data/planner-math'
import { formatSetName } from '@/utils/artifact-stats'
import { domainsForSet, type ArtifactDomainInfo } from './artifact-domains'

// ------------------------------------------------------------------ resin per day

/** Original Resin one daily refresh buys (Fragile Resin or primogems). */
export const REFRESH_RESIN = 60
/** Refreshes a day the setting allows. */
export const MAX_REFRESHES = 6

export const clampRefreshes = (n: number | null | undefined) =>
  Math.max(0, Math.min(MAX_REFRESHES, Math.trunc(Number.isFinite(n) ? (n as number) : 0)))

/** Original Resin spent a day: what regenerates (180) plus the refreshes. */
export function dailyResin(refreshes: number): number {
  return RESIN_PER_DAY + REFRESH_RESIN * clampRefreshes(refreshes)
}

/** Days `resin` takes at the daily resin, rounded up. */
export function resinDays(resin: number, refreshes = 0): number {
  return resin > 0 ? Math.ceil(resin / dailyResin(refreshes)) : 0
}

// ------------------------------------------------------------------ the day

export interface FarmDay {
  /** Game day on the server (0 = Sunday, as Date#getDay). */
  weekday: number
  /** Until the 04:00 reset. */
  msUntilReset: number
}

/** The game day on the account's server at `now` (no server: the browser's zone). */
export function farmDay(now: number, server: string | null | undefined): FarmDay {
  return { weekday: serverWeekday(now, server), msUntilReset: msUntilReset(now, server) }
}

/** A domain family's day pair without Sunday ([1, 4], [2, 5], [3, 6]). */
export const pairOf = (weekdays: readonly number[]) => weekdays.filter((d) => d !== 0)

/** Whether a domain family drops on `weekday` (every family does on Sunday). */
export const openOn = (weekdays: readonly number[], weekday: number) =>
  weekday === 0 || weekdays.includes(weekday)

// ------------------------------------------------------------------ cards

export type FarmCardKind =
  | 'domain'
  | 'ley'
  | 'boss'
  | 'gem'
  | 'weekly'
  | 'local'
  | 'common'
  | 'elite'
  | 'ore'
  | 'other'
  | 'artifact'

/** A card's estimate, with days counted at the account's daily resin. */
export interface CardRun {
  /** Runs (weekly bosses: claims). */
  runs: number
  /** Original Resin; a weekly boss's with the weekly discount. */
  resin: number
  /** A weekly boss's without the discount (else = resin). */
  resinMax: number
  condensed: number
  /** Days at the daily resin; weeks for a weekly boss (one claim a week). */
  days: number
  weekly: boolean
  /** Domain tier, boss level or World Level the runs assume. */
  bracket: Bracket | null
  /** The runs are the most it takes (World Level 9 boss drops: "at most N runs"). */
  upperBound: boolean
}

export interface FarmCard {
  id: string
  kind: FarmCardKind
  /**
   * Domain entrance, weekly boss, ley line, normal boss, enemy, region; what
   * an item list holds when the place isn't known.
   */
  name: string
  /**
   * The second line: a domain's families today ("Freedom"), the other bosses
   * or enemies dropping it, a region's areas, an artifact domain's sets; ''.
   */
  detail: string
  /** Talent books or weapon materials (domain cards). */
  domain: DomainKind | null
  /** Original Resin a run costs (0: none; weekly: the discounted 30). */
  resinPerRun: number
  run: CardRun | null
  /** `ok`, `locked` (AR/WL too low), `no-rate` (no estimate) or `not-farmed`. */
  status: EstimateStatus
  /** What the account lacks to farm it ("AR 16", "WL 1"); null when it can. */
  lock: string | null
  /** The materials still missing. */
  lines: MaterialLine[]
  /** Goals needing them (`character:Key`, `weapon:Key:Owner`, `item:Key`), in need order. */
  goals: string[]
  /** Blossom of Wealth: the Mora the planned domain runs pay (taken off before counting runs). */
  paid: number
  /** Weekly bosses: conversions not made for lack of Dream Solvent. */
  blocked: number
  /** Artifact cards: the sets wanted there (GOOD keys); else []. */
  sets: string[]
}

/** Artifact sets a counted goal still wants. */
export interface ArtifactWant {
  /** The character's goal id (`character:Key`, `custom:<id>`). */
  goal: string
  sets: readonly string[]
}

export interface FarmInput {
  planner: PlannerData
  plan: FarmPlan
  totals: PlanTotals
  /** The drop rates (for which bracket a locked source needs); null when not loaded. */
  drops: DropRates | null
  ar: number | null
  wl: number | null
  /** Daily resin refreshes (0–6). */
  refreshes: number
  /** Who drops what and where it grows (`loadFarming`); null/absent: cards without places. */
  farming?: FarmingData | null
  /** Artifact sets the counted goals still want. */
  artifacts?: readonly ArtifactWant[]
}

const missingOnly = (lines: readonly MaterialLine[]) => lines.filter((l) => l.missing > 0)

/** The goals needing what is missing (all of the lines' when nothing is), in first-need order. */
export function goalsOf(lines: readonly MaterialLine[]): string[] {
  const short = missingOnly(lines)
  const set = new Set<string>()
  for (const l of short.length ? short : lines) for (const g of l.goals) set.add(g)
  return [...set]
}

function condensedResin(planner: PlannerData): number {
  return planner.resin.items.find((i) => i.key === planner.resin.condensed.key)?.resin ?? 0
}

/** Several estimates as one card's (domain families together). */
function sumRuns(
  runs: readonly RunEstimate[],
  input: Pick<FarmInput, 'planner' | 'refreshes'>,
): CardRun | null {
  const first = runs[0]
  if (!first) return null
  const resin = runs.reduce((sum, r) => sum + r.resin, 0)
  const condensed = condensedResin(input.planner)
  return {
    runs: runs.reduce((sum, r) => sum + r.runs, 0),
    resin,
    resinMax: resin,
    condensed: condensed > 0 ? Math.ceil(resin / condensed) : 0,
    days: resinDays(resin, input.refreshes),
    weekly: false,
    bracket: first.bracket,
    upperBound: runs.some((r) => r.upperBound === true),
  }
}

/**
 * Estimates for things one run drops together (a boss's material and its
 * gems): the runs of the one that takes longest.
 */
function longestRun(
  runs: readonly RunEstimate[],
  input: Pick<FarmInput, 'planner' | 'refreshes'>,
): CardRun | null {
  const longest = runs.reduce<RunEstimate | null>((a, r) => (a && a.runs >= r.runs ? a : r), null)
  return longest ? sumRuns([longest], input) : null
}

/** The worst status of the parts with something missing. */
function worst(statuses: readonly EstimateStatus[]): EstimateStatus {
  if (statuses.length === 0) return 'done'
  for (const s of ['locked', 'no-rate', 'not-farmed'] as const) if (statuses.includes(s)) return s
  return statuses.every((s) => s === 'done') ? 'done' : 'ok'
}

const minKey = (map: ReadonlyMap<number, unknown> | undefined) =>
  map && map.size ? Math.min(...map.keys()) : null

/** The Adventure Rank a domain needs before it drops anything for the account. */
function domainLock(entry: DomainEntry, ar: number | null): string {
  const open = domainTierFor(entry, ar)
  // Nothing open yet: the first tier's AR; open but short (a tier nothing drops): the next one's.
  const next = open ? entry.tiers.find((t) => t.tier > open.tier) : entry.tiers[0]
  return next ? `AR ${next.ar}` : 'Locked'
}

const wlLock = (map: ReadonlyMap<number, unknown> | undefined) => {
  const wl = minKey(map)
  return wl === null ? 'Locked' : `WL ${wl}`
}

/** A domain entrance with only the families given (today's, or a day pair's). */
export function domainCard(
  domain: FarmDomain,
  groups: readonly FarmGroup[],
  input: FarmInput,
): FarmCard | null {
  const short = groups.filter((g) => g.missing > 0)
  if (short.length === 0) return null
  const lines = short.flatMap((g) => missingOnly(g.lines))
  const status = worst(short.map((g) => g.status))
  const entry = domain.entry
  return {
    id: `${domain.id}:${short.map((g) => g.key).join('+')}`,
    kind: 'domain',
    name: entry.name || short.map((g) => g.name).join(' · '),
    detail: entry.name ? short.map((g) => g.name).join(' · ') : '',
    domain: entry.kind,
    resinPerRun: entry.tiers[0]?.resin ?? 0,
    run: sumRuns(
      short.flatMap((g) => (g.run ? [g.run] : [])),
      input,
    ),
    status,
    lock: status === 'locked' ? domainLock(entry, input.ar) : null,
    lines,
    goals: goalsOf(lines),
    paid: 0,
    blocked: 0,
    sets: [],
  }
}

/** A run on its own (a ley line). */
const oneRun = (run: RunEstimate | null, input: FarmInput) => (run ? sumRuns([run], input) : null)

/** EXP points as the largest book or ore (what the chip shows; the popover has them all). */
export function expLine(planner: PlannerData, total: ExpTotal, kind: 'character' | 'weapon') {
  const items = planner.expItems[kind]
  const big = items[items.length - 1]
  if (!big) return null
  return {
    material: big.material,
    need: Math.ceil(total.need / big.exp),
    have: Math.floor(total.have / big.exp),
    crafted: 0,
    spent: 0,
    missing: Math.ceil(total.missing / big.exp),
    goals: [...total.goals],
  } satisfies MaterialLine
}

function leyCard(line: FarmLeyLine, input: FarmInput): FarmCard | null {
  if (line.status === 'done') return null
  const { planner, totals } = input
  const material =
    line.kind === 'exp'
      ? expLine(planner, totals.characterExp, 'character')
      : ({
          material: planner.mora,
          need: totals.mora.need,
          have: totals.mora.have,
          crafted: 0,
          spent: 0,
          missing: totals.mora.missing,
          goals: [...totals.mora.goals],
        } satisfies MaterialLine)
  const lines = material ? [material] : []
  return {
    id: `ley:${line.kind}`,
    kind: 'ley',
    name: line.kind === 'exp' ? 'Blossom of Revelation' : 'Blossom of Wealth',
    detail: '',
    domain: null,
    resinPerRun: planner.resin.leyLine,
    run: oneRun(line.run, input),
    status: line.status,
    lock: line.status === 'locked' ? wlLock(input.drops?.leyLines.byWorldLevel) : null,
    lines,
    goals: goalsOf(lines),
    paid: line.fromDomains,
    blocked: 0,
    sets: [],
  }
}

function weeklyCard(weekly: FarmWeekly, input: FarmInput): FarmCard | null {
  const boss = weekly.boss
  if (!boss || weekly.missing === 0) return null
  const lines = missingOnly(weekly.lines)
  const run = weekly.run
  let lock: string | null = null
  if (weekly.status === 'locked') {
    if (boss.tiers.length > 0) {
      const open = weeklyTierFor(boss, input.ar)
      lock = open ? 'Locked' : `AR ${boss.tiers[0]!.ar}`
    } else lock = wlLock(input.drops?.weekly.byWorldLevel.get(boss.key))
  }
  const condensed = condensedResin(input.planner)
  return {
    id: weekly.id,
    kind: 'weekly',
    name: boss.name,
    detail: '',
    domain: null,
    resinPerRun: input.drops?.weekly.discountResin ?? input.drops?.weekly.resin ?? 0,
    run: run
      ? {
          runs: run.runs,
          resin: run.resinMin,
          resinMax: run.resinMax,
          condensed: condensed > 0 ? Math.ceil(run.resinMin / condensed) : 0,
          days: run.weeks,
          weekly: true,
          bracket: run.bracket,
          upperBound: run.upperBound === true,
        }
      : null,
    status: weekly.status,
    lock,
    lines,
    goals: goalsOf(lines),
    paid: 0,
    blocked: weekly.conversion?.blocked ?? 0,
    sets: [],
  }
}

/** One card listing items without a resin source (they farm anywhere, or aren't farmed). */
function listCard(
  id: string,
  kind: 'local' | 'common' | 'elite' | 'other',
  name: string,
  lines: readonly MaterialLine[],
  detail = '',
): FarmCard | null {
  const short = missingOnly(lines)
  if (short.length === 0) return null
  return {
    id,
    kind,
    name,
    detail,
    domain: null,
    resinPerRun: 0,
    run: null,
    status: 'not-farmed',
    lock: null,
    lines: short,
    goals: goalsOf(short),
    paid: 0,
    blocked: 0,
    sets: [],
  }
}

function oreCard(input: FarmInput): FarmCard | null {
  const total = input.totals.weaponExp
  if (total.missing <= 0) return null
  const line = expLine(input.planner, total, 'weapon')
  if (!line) return null
  return {
    id: 'ore',
    kind: 'ore',
    name: line.material.name,
    detail: '',
    domain: null,
    resinPerRun: 0,
    run: null,
    status: 'not-farmed',
    lock: null,
    lines: [line],
    goals: goalsOf([line]),
    paid: 0,
    blocked: 0,
    sets: [],
  }
}

// ------------------------------------------------------------------ sections

export type FarmSectionKey = 'free' | 'domain' | 'boss' | 'weekly' | 'artifact'

export interface FarmSection {
  key: FarmSectionKey
  /** Original Resin a run costs: '0', '20', '40', '30/60'. */
  resin: string
  label: string
  cards: FarmCard[]
}

const nonNull = <T>(list: readonly (T | null)[]): T[] => list.filter((x): x is T => x !== null)

/** Cards the account can't farm yet go last (stable otherwise). */
const lockedLast = (cards: FarmCard[]) =>
  cards
    .map((card, i) => ({ card, i }))
    .sort((a, b) => Number(a.card.lock !== null) - Number(b.card.lock !== null) || a.i - b.i)
    .map((x) => x.card)

const unique = (list: readonly string[]) => [...new Set(list)]

/** "Slime", "Hilichurl · Samachurl · Mitachurl": the first name, the rest underneath. */
function nameAndDetail(names: readonly string[], fallback: string) {
  const list = unique(names)
  return { name: list[0] ?? fallback, detail: list.slice(1).join(' · ') }
}

/** Local specialties, one card per region (its areas underneath); unknown regions last. */
function localCards(input: FarmInput, groups: readonly FarmGroup[]): FarmCard[] {
  const lines = groups.filter((g) => g.kind === 'local').flatMap((g) => missingOnly(g.lines))
  const farming = input.farming
  if (!farming) return nonNull([listCard('local', 'local', 'Local specialties', lines)])
  const byRegion = new Map<number, { name: string; lines: MaterialLine[]; areas: string[] }>()
  for (const line of lines) {
    const source = farming.localOf.get(line.material.key)
    const id = source?.region?.id ?? 0
    const region = byRegion.get(id) ?? {
      name: source?.region?.name ?? 'Local specialties',
      lines: [],
      areas: [],
    }
    region.lines.push(line)
    region.areas.push(...(source?.areas ?? []))
    byRegion.set(id, region)
  }
  return [...byRegion]
    .sort(([a], [b]) => (a || Infinity) - (b || Infinity))
    .flatMap(([id, r]) =>
      nonNull([listCard(`local:${id}`, 'local', r.name, r.lines, unique(r.areas).join(' · '))]),
    )
}

/**
 * Common or elite drops, one card per enemy (the enemy the game data lists
 * first for the drop: its own category, fewest drops); families sharing it
 * share the card. The other enemies dropping them go underneath.
 */
function enemyCards(
  input: FarmInput,
  groups: readonly FarmGroup[],
  kind: 'common' | 'elite',
): FarmCard[] {
  const mine = groups.filter((g) => g.kind === 'enemy' && g.lines[0]?.material.kind === kind)
  const label = kind === 'common' ? 'Common enemies' : 'Elite enemies'
  const farming = input.farming
  if (!farming) {
    return nonNull([
      listCard(
        kind,
        kind,
        label,
        mine.flatMap((g) => g.lines),
      ),
    ])
  }
  const cards = new Map<string, { enemies: EnemyGroup[]; lines: MaterialLine[] }>()
  for (const g of mine) {
    const enemies = farming.enemiesOf.get(g.key) ?? []
    const id = enemies[0] ? `${kind}:${enemies[0].id || enemies[0].name}` : `${kind}:${g.key}`
    const card = cards.get(id) ?? { enemies: [], lines: [] }
    card.enemies.push(...enemies)
    card.lines.push(...g.lines)
    cards.set(id, card)
  }
  return [...cards].flatMap(([id, c]) => {
    const { name, detail } = nameAndDetail(
      c.enemies.map((e) => e.name),
      label,
    )
    return nonNull([listCard(id, kind, name, c.lines, detail)])
  })
}

/** Everything farmed without resin: local specialties, enemy drops, ore, what isn't farmed. */
export function freeCards(input: FarmInput): FarmCard[] {
  const groups = input.plan.groups.filter((g) => g.missing > 0)
  const lines = (pick: (g: FarmGroup) => boolean) => groups.filter(pick).flatMap((g) => g.lines)
  const quest = input.plan.weekly.filter((w) => w.boss === null).flatMap((w) => w.lines)
  return [
    ...localCards(input, groups),
    ...enemyCards(input, groups, 'common'),
    ...enemyCards(input, groups, 'elite'),
    ...nonNull([
      oreCard(input),
      listCard('other', 'other', 'Other', [
        ...lines((g) => g.kind === 'crown' || (g.kind === 'gem' && g.status === 'not-farmed')),
        ...quest,
      ]),
    ]),
  ]
}

/** Ley lines (every day). */
export function leyCards(input: FarmInput): FarmCard[] {
  return nonNull([
    leyCard(input.plan.leyLines.exp, input),
    leyCard(input.plan.leyLines.mora, input),
  ])
}

interface BossCardParts {
  id: string
  kind: 'boss' | 'gem'
  /** Who drops it, the first named on the card. */
  bosses: readonly NormalBoss[]
  /** Without boss names: the drop's name. */
  fallback: string
  groups: FarmGroup[]
}

function bossCard(parts: BossCardParts, input: FarmInput, resinPerRun: number): FarmCard {
  const lines = parts.groups.flatMap((g) => missingOnly(g.lines))
  const status = worst(parts.groups.map((g) => g.status))
  const { name, detail } = nameAndDetail(
    parts.bosses.map((b) => b.name),
    parts.fallback,
  )
  return {
    id: parts.id,
    kind: parts.kind,
    name,
    detail,
    domain: null,
    resinPerRun,
    run: longestRun(
      parts.groups.flatMap((g) => (g.run ? [g.run] : [])),
      input,
    ),
    status,
    lock: status === 'locked' ? wlLock(input.drops?.bosses.byWorldLevel) : null,
    lines,
    goals: goalsOf(lines),
    paid: 0,
    blocked: 0,
    sets: [],
  }
}

/**
 * Normal bosses (40 resin, every day), named after the boss: its drops, and
 * the gems it drops when it is a single-element boss (a run drops both);
 * then the other gems, each named after the bosses dropping it,
 * single-element ones first.
 */
export function bossCards(input: FarmInput): FarmCard[] {
  const resin = input.drops?.bosses.resin ?? 40
  const groups = input.plan.groups.filter((g) => g.missing > 0)
  const farming = input.farming
  const cards = new Map<string, BossCardParts>()
  /** Boss card id by boss (name: hand-kept bosses have no handbook id). */
  const byBoss = new Map<string, string>()
  for (const g of groups.filter((x) => x.kind === 'boss')) {
    const bosses = farming?.bossesOf.get(g.key) ?? []
    const boss = bosses[0]
    const id = boss ? `boss:${boss.name}` : g.id
    const card = cards.get(id)
    if (card) card.groups.push(g)
    else cards.set(id, { id, kind: 'boss', bosses, fallback: g.name, groups: [g] })
    for (const b of bosses) if (!byBoss.has(b.name)) byBoss.set(b.name, id)
  }
  const gems: BossCardParts[] = []
  for (const g of groups.filter((x) => x.kind === 'gem' && x.status !== 'not-farmed')) {
    const bosses = farming?.gemBossesOf.get(g.key) ?? []
    const host = bosses.find((b) => b.gems.length === 1 && byBoss.has(b.name))
    const card = host ? cards.get(byBoss.get(host.name)!) : undefined
    if (card) card.groups.push(g)
    else gems.push({ id: g.id, kind: 'gem', bosses, fallback: g.name, groups: [g] })
  }
  return lockedLast([...cards.values(), ...gems].map((parts) => bossCard(parts, input, resin)))
}

/** Weekly bosses (one claim a week each). */
export function weeklyCards(input: FarmInput): FarmCard[] {
  return lockedLast(nonNull(input.plan.weekly.map((w) => weeklyCard(w, input))))
}

/** Domain entrances with the families open on `weekday` that something misses. */
export function domainCardsOn(input: FarmInput, weekday: number): FarmCard[] {
  return lockedLast(
    nonNull(
      input.plan.domains.map((d) =>
        domainCard(
          d,
          d.groups.filter((g) => openOn(g.weekdays, weekday)),
          input,
        ),
      ),
    ),
  )
}

/** Sets with no domain in the game data (bosses, events…) share one card. */
export const ELSEWHERE = 'Elsewhere'

/**
 * Artifact domains (20 resin, every day) for the sets the counted goals
 * still want, each with the sets wanted there and who wants them, in the
 * order the goals want them. A set several domains drop (4★ sets) goes
 * where the same goal already farms, else to a domain already on a card,
 * else the first. Sets no domain drops share one card, last. No run
 * estimate: artifacts are luck.
 */
export function artifactCards(input: FarmInput): FarmCard[] {
  const wants = input.artifacts ?? []
  const cards = new Map<
    number,
    { domain: ArtifactDomainInfo | null; sets: string[]; goals: string[] }
  >()
  const add = (domain: ArtifactDomainInfo | null, set: string, goal: string) => {
    const id = domain?.id ?? -1
    const card = cards.get(id) ?? { domain, sets: [], goals: [] }
    if (!card.sets.includes(set)) card.sets.push(set)
    if (!card.goals.includes(goal)) card.goals.push(goal)
    cards.set(id, card)
  }
  const later: { set: string; goal: string; domains: readonly ArtifactDomainInfo[] }[] = []
  for (const want of wants) {
    for (const set of want.sets) {
      const domains = domainsForSet(input.farming, set)
      if (domains.length <= 1) add(domains[0] ?? null, set, want.goal)
      else later.push({ set, goal: want.goal, domains })
    }
  }
  for (const { set, goal, domains } of later) {
    const mine = domains.find((d) => cards.get(d.id)?.goals.includes(goal))
    add(mine ?? domains.find((d) => cards.has(d.id)) ?? domains[0]!, set, goal)
  }
  const ar = input.ar
  const list = [...cards.values()].map(({ domain, sets, goals }): FarmCard => {
    const lock = domain && ar !== null && ar < domain.ar ? `AR ${domain.ar}` : null
    return {
      id: domain ? `artifact:${domain.id}` : 'artifact:elsewhere',
      kind: 'artifact',
      name: domain?.name ?? ELSEWHERE,
      detail: sets.map(formatSetName).join(' · '),
      domain: null,
      resinPerRun: domain?.resin ?? 0,
      run: null,
      status: lock ? 'locked' : domain ? 'ok' : 'not-farmed',
      lock,
      lines: [],
      goals,
      paid: 0,
      blocked: 0,
      sets,
    }
  })
  return lockedLast(
    list.sort(
      (a, b) => Number(a.id === 'artifact:elsewhere') - Number(b.id === 'artifact:elsewhere'),
    ),
  )
}

/**
 * Today's cards by what a run costs: nothing (exploration, enemies, ore,
 * other), 20 (today's domains, then ley lines), 40 (normal bosses and
 * gems), 30/60 (weekly bosses), then artifact domains (20). Sections with
 * nothing to farm are left out.
 */
export function todaySections(input: FarmInput, weekday: number): FarmSection[] {
  const sections: FarmSection[] = [
    { key: 'free', resin: '0', label: 'No resin', cards: freeCards(input) },
    {
      key: 'domain',
      resin: '20',
      label: 'Domains · Ley lines',
      cards: lockedLast([...domainCardsOn(input, weekday), ...leyCards(input)]),
    },
    { key: 'boss', resin: '40', label: 'Bosses', cards: bossCards(input) },
    { key: 'weekly', resin: '30/60', label: 'Weekly bosses', cards: weeklyCards(input) },
    { key: 'artifact', resin: '20', label: 'Artifacts', cards: artifactCards(input) },
  ]
  return sections.filter((s) => s.cards.length > 0)
}

// ------------------------------------------------------------------ schedule

export interface ScheduleDay {
  /** The day pair (Mon/Thu: [1, 4]). */
  days: number[]
  cards: FarmCard[]
  /** The pair's runs together (locked domains aside). */
  run: CardRun | null
}

const PAIRS = [
  [1, 4],
  [2, 5],
  [3, 6],
] as const

/**
 * The domains of the day pairs other than today's (all three on Sunday,
 * when Today has every domain), from the next to open: each entrance with
 * only that pair's families something misses.
 */
export function scheduleDays(input: FarmInput, weekday: number): ScheduleDay[] {
  const next = (pair: readonly number[]) => Math.min(...pair.map((d) => (d - weekday + 7) % 7 || 7))
  return PAIRS.filter((pair) => !(pair as readonly number[]).includes(weekday))
    .slice()
    .sort((a, b) => next(a) - next(b))
    .map((pair) => {
      const cards = lockedLast(
        nonNull(
          input.plan.domains.map((d) =>
            domainCard(
              d,
              d.groups.filter((g) => pairOf(g.weekdays).join() === pair.join()),
              input,
            ),
          ),
        ),
      )
      const runs = cards.flatMap((c) => (c.run && c.lock === null ? [c.run] : []))
      return { days: [...pair], cards, run: combine(runs, input) }
    })
}

/** Card estimates together (a day pair's domains). */
function combine(runs: readonly CardRun[], input: FarmInput): CardRun | null {
  const first = runs[0]
  if (!first) return null
  const resin = runs.reduce((sum, r) => sum + r.resin, 0)
  const condensed = condensedResin(input.planner)
  return {
    runs: runs.reduce((sum, r) => sum + r.runs, 0),
    resin,
    resinMax: runs.reduce((sum, r) => sum + r.resinMax, 0),
    condensed: condensed > 0 ? Math.ceil(resin / condensed) : 0,
    days: resinDays(resin, input.refreshes),
    weekly: false,
    bracket: first.bracket,
    upperBound: runs.some((r) => r.upperBound),
  }
}

// ------------------------------------------------------------------ headline

export interface FarmHeadline {
  /** Domains, normal boss drops and ley lines (Seelie's headline; gems and weekly bosses apart). */
  runs: number
  resin: number
  condensed: number
  /** At the daily resin (180 + 60 per refresh). */
  days: number
  daily: number
  /** Something farmable is missing without an estimate. */
  partial: boolean
  /** Some runs are upper bounds (World Level 9 boss drops): it takes at most this. */
  upperBound: boolean
  /** Sources the account's AR/WL can't farm yet. */
  locked: number
  weekly: { claims: number; weeks: number; resin: number; resinMax: number; partial: boolean }
  /** Normal boss runs for gems (not in `resin`). */
  gems: { runs: number; resin: number }
}

export function farmHeadline(plan: FarmPlan, refreshes: number): FarmHeadline {
  const t = plan.total
  const w = plan.weeklyTotal
  return {
    runs: t.runs,
    resin: t.resin,
    condensed: t.condensed,
    days: resinDays(t.resin, refreshes),
    daily: dailyResin(refreshes),
    partial: t.partial,
    upperBound: t.upperBound === true,
    locked: t.locked,
    weekly: {
      claims: w.runs,
      weeks: w.weeks,
      resin: w.resin,
      resinMax: w.resinMax,
      partial: w.partial,
    },
    gems: { ...t.gems },
  }
}
