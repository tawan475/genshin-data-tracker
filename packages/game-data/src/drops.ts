/**
 * Average drops per run, hand-kept in `overrides/drops.json` from the
 * Genshin Impact Wiki (overrides/README.md says how to update it). The
 * planner estimates runs, resin and days only where this file has a number;
 * a missing value means "no estimate", never a guess.
 *
 * One parser for everyone: the app loads the file with `loadDropRates()`,
 * the build validates it with `parseDropRates()` and fails on any problem.
 *
 * What comes from the game data instead (planner.json): domain tiers and the
 * Adventure Rank each needs, resin per domain and ley line run, domain Mora,
 * weekly boss levels per Adventure Rank.
 */

import type { DomainKind } from './format'

export interface DropSource {
  id: string
  /** Wiki page title. */
  page: string
  /** Permalink to the revision the numbers were read from. */
  url: string
  revid: number | null
  /** When it was read (YYYY-MM-DD). */
  read: string
  note: string
}

export interface DomainTierDrops {
  /** Domain tier, 1 = I. */
  tier: number
  /** Average per run by material tier, lowest first (Teachings, Guide, Philosophies…). */
  perRun: readonly number[]
  /** The wiki's first-roll mean of the lowest tier: what the game's preview shows (a cross-check). */
  firstRoll: number | null
}

export interface BossDrops {
  wl: number
  /** Boss material (Hurricane Seed…) per run; null when the wiki has none. */
  boss: number | null
  /** Ascension gems per run by tier (Sliver first); null when the wiki has none. */
  gems: readonly number[] | null
}

export interface LeyLineDrops {
  wl: number
  /** Character EXP per Blossom of Revelation. */
  exp: number | null
  /** Mora per Blossom of Wealth. */
  mora: number | null
}

export interface DropRates {
  /** By id, as the sections cite them. */
  sources: ReadonlyMap<string, DropSource>
  domains: Record<DomainKind, { sources: string[]; tiers: ReadonlyMap<number, DomainTierDrops> }>
  bosses: { resin: number | null; sources: string[]; byWorldLevel: ReadonlyMap<number, BossDrops> }
  weekly: {
    /** Full price of a claim, and the discounted price of the first `discounts` claims each week. */
    resin: number | null
    discountResin: number | null
    discounts: number
    /** Dream Solvent per claim. */
    solvent: number | null
    sources: string[]
    /** Talent materials per claim by boss level. */
    byLevel: ReadonlyMap<number, number>
    /** Bosses outside domains (by their trio's lowest-id material key): per World Level. */
    byWorldLevel: ReadonlyMap<string, ReadonlyMap<number, number>>
  }
  leyLines: { sources: string[]; byWorldLevel: ReadonlyMap<number, LeyLineDrops> }
}

export function emptyDropRates(): DropRates {
  return {
    sources: new Map(),
    domains: {
      talent: { sources: [], tiers: new Map() },
      weapon: { sources: [], tiers: new Map() },
    },
    bosses: { resin: null, sources: [], byWorldLevel: new Map() },
    weekly: {
      resin: null,
      discountResin: null,
      discounts: 0,
      solvent: null,
      sources: [],
      byLevel: new Map(),
      byWorldLevel: new Map(),
    },
    leyLines: { sources: [], byWorldLevel: new Map() },
  }
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const entries = (v: unknown): [string, unknown][] =>
  isObject(v) ? Object.entries(v).filter(([k]) => !k.startsWith('$')) : []
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const wholeNumber = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/**
 * Reads `overrides/drops.json`. Malformed parts are skipped and reported in
 * `problems` (the build fails on any); what is valid is still returned.
 */
export function parseDropRates(json: unknown): { rates: DropRates; problems: string[] } {
  const rates = emptyDropRates()
  const problems: string[] = []
  if (!isObject(json)) return { rates, problems: ['drops.json must hold a JSON object'] }
  const known = ['sources', 'domains', 'bosses', 'weekly', 'leyLines']
  for (const [key] of entries(json)) {
    if (!known.includes(key))
      problems.push(`unknown section "${key}" (expected ${known.join(', ')})`)
  }

  const sources = new Map<string, DropSource>()
  for (const [id, value] of entries(json.sources)) {
    if (!isObject(value) || typeof value.page !== 'string' || typeof value.url !== 'string') {
      problems.push(`sources.${id} needs "page" and "url"`)
      continue
    }
    if (typeof value.read !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.read))
      problems.push(`sources.${id}.read must be the date read (YYYY-MM-DD)`)
    const revid = typeof value.revid === 'number' ? value.revid : null
    if (revid === null && !/[?&]oldid=\d+/.test(value.url))
      problems.push(`sources.${id} needs a "revid" (or an oldid permalink) so it can be re-checked`)
    sources.set(id, {
      id,
      page: value.page,
      url: value.url,
      revid,
      read: typeof value.read === 'string' ? value.read : '',
      note: typeof value.note === 'string' ? value.note : '',
    })
  }
  rates.sources = sources

  const cite = (where: string, value: unknown): string[] => {
    if (!Array.isArray(value) || value.length === 0 || value.some((s) => typeof s !== 'string')) {
      problems.push(`${where}.sources must list source ids`)
      return []
    }
    for (const id of value as string[]) {
      if (!sources.has(id)) problems.push(`${where}.sources: "${id}" is not in sources`)
    }
    return value as string[]
  }
  const rows = (where: string, value: unknown): Json[] => {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((r) => !isObject(r))) {
      problems.push(`${where} must be a list of objects`)
      return []
    }
    return value as Json[]
  }
  const numbers = (where: string, value: unknown, max: number): number[] | null => {
    if (value === undefined || value === null) return null
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > max ||
      value.some((v) => !(typeof v === 'number' && v >= 0 && Number.isFinite(v)))
    ) {
      problems.push(`${where} must be 1-${max} averages (numbers ≥ 0)`)
      return null
    }
    return value as number[]
  }
  const optionalPositive = (where: string, value: unknown): number | null => {
    if (value === undefined || value === null) return null
    if (!positive(value)) {
      problems.push(`${where} must be a number > 0`)
      return null
    }
    return value
  }

  // Domains: per kind, per tier.
  const domains = isObject(json.domains) ? json.domains : {}
  for (const [kind] of entries(domains)) {
    if (kind !== 'talent' && kind !== 'weapon')
      problems.push(`domains.${kind}: expected talent or weapon`)
  }
  for (const kind of ['talent', 'weapon'] as const) {
    const section = domains[kind]
    if (section === undefined) continue
    if (!isObject(section)) {
      problems.push(`domains.${kind} must be an object`)
      continue
    }
    const where = `domains.${kind}`
    const out = rates.domains[kind]
    out.sources = cite(where, section.sources)
    const tiers = new Map<number, DomainTierDrops>()
    for (const [i, row] of rows(`${where}.tiers`, section.tiers).entries()) {
      const at = `${where}.tiers[${i}]`
      if (!wholeNumber(row.tier, 1, 10)) {
        problems.push(`${at}.tier must be 1-10`)
        continue
      }
      if (tiers.has(row.tier)) problems.push(`${at}: tier ${row.tier} is listed twice`)
      const perRun = numbers(`${at}.perRun`, row.perRun, kind === 'talent' ? 3 : 4)
      if (!perRun) continue
      tiers.set(row.tier, {
        tier: row.tier,
        perRun,
        firstRoll: optionalPositive(`${at}.firstRoll`, row.firstRoll),
      })
    }
    out.tiers = tiers
  }

  // Normal bosses: per World Level.
  if (json.bosses !== undefined) {
    const section = isObject(json.bosses) ? json.bosses : {}
    rates.bosses.resin = optionalPositive('bosses.resin', section.resin)
    rates.bosses.sources = cite('bosses', section.sources)
    const byWl = new Map<number, BossDrops>()
    for (const [i, row] of rows('bosses.byWorldLevel', section.byWorldLevel).entries()) {
      const at = `bosses.byWorldLevel[${i}]`
      if (!wholeNumber(row.wl, 0, 20)) {
        problems.push(`${at}.wl must be a World Level`)
        continue
      }
      if (byWl.has(row.wl)) problems.push(`${at}: WL ${row.wl} is listed twice`)
      byWl.set(row.wl, {
        wl: row.wl,
        boss: optionalPositive(`${at}.boss`, row.boss),
        gems: numbers(`${at}.gems`, row.gems, 4),
      })
    }
    rates.bosses.byWorldLevel = byWl
  }

  // Weekly bosses.
  if (json.weekly !== undefined) {
    const section = isObject(json.weekly) ? json.weekly : {}
    const w = rates.weekly
    w.resin = optionalPositive('weekly.resin', section.resin)
    w.discountResin = optionalPositive('weekly.discountResin', section.discountResin)
    if (section.discounts !== undefined && !wholeNumber(section.discounts, 0, 20))
      problems.push('weekly.discounts must be a whole number')
    w.discounts = wholeNumber(section.discounts, 0, 20) ? section.discounts : 0
    w.solvent = optionalPositive('weekly.solvent', section.solvent)
    w.sources = cite('weekly', section.sources)
    const byLevel = new Map<number, number>()
    for (const [i, row] of rows('weekly.byLevel', section.byLevel).entries()) {
      const at = `weekly.byLevel[${i}]`
      if (!wholeNumber(row.level, 1, 200) || !positive(row.perRun)) {
        problems.push(`${at} needs a boss "level" and "perRun" > 0`)
        continue
      }
      byLevel.set(row.level, row.perRun)
    }
    w.byLevel = byLevel
    const byWorldLevel = new Map<string, Map<number, number>>()
    for (const [key, list] of entries(section.byWorldLevel)) {
      const map = new Map<number, number>()
      for (const [i, row] of rows(`weekly.byWorldLevel.${key}`, list).entries()) {
        if (!wholeNumber(row.wl, 0, 20) || !positive(row.perRun)) {
          problems.push(`weekly.byWorldLevel.${key}[${i}] needs "wl" and "perRun" > 0`)
          continue
        }
        map.set(row.wl, row.perRun)
      }
      byWorldLevel.set(key, map)
    }
    w.byWorldLevel = byWorldLevel
  }

  // Ley lines: per World Level.
  if (json.leyLines !== undefined) {
    const section = isObject(json.leyLines) ? json.leyLines : {}
    rates.leyLines.sources = cite('leyLines', section.sources)
    const byWl = new Map<number, LeyLineDrops>()
    for (const [i, row] of rows('leyLines.byWorldLevel', section.byWorldLevel).entries()) {
      const at = `leyLines.byWorldLevel[${i}]`
      if (!wholeNumber(row.wl, 0, 20)) {
        problems.push(`${at}.wl must be a World Level`)
        continue
      }
      if (byWl.has(row.wl)) problems.push(`${at}: WL ${row.wl} is listed twice`)
      byWl.set(row.wl, {
        wl: row.wl,
        exp: optionalPositive(`${at}.exp`, row.exp),
        mora: optionalPositive(`${at}.mora`, row.mora),
      })
    }
    rates.leyLines.byWorldLevel = byWl
  }

  return { rates, problems }
}

let loading: Promise<DropRates> | undefined

/**
 * The drop rates (cached; a failed load is retried next call). Malformed
 * entries are dropped silently here: the build has already refused them.
 */
export function loadDropRates(): Promise<DropRates> {
  loading ??= import('../overrides/drops.json')
    .then((m) => parseDropRates(m.default).rates)
    .catch((error: unknown) => {
      loading = undefined
      throw error
    })
  return loading
}
