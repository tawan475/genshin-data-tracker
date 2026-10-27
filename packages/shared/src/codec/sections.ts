/**
 * The stored form of each part of a snapshot. Every section is canonical JSON
 * (sorted, defaults trimmed, keys as dictionary ids) stored once under a hash
 * of its text, so an unchanged section is stored once no matter how many
 * snapshots share it. Storage v1 kept that text deflated; v2 keeps a binary
 * layout of the same value (section-blob.ts, store-v2.ts), but the canonical
 * JSON is still what is hashed and what every reader gets back.
 *
 * These shapes are a storage format: data written today must decode forever.
 * Only ever add new optional trailing fields.
 */

import type { ArtifactIdentity, ArtifactState } from '../artifact'
import { CHARACTERS, WEAPONS, fromRef, toRef, type KeyDictionary, type KeyRef } from '../dictionary'
import type {
  ArchiveTab,
  GiAnecdotes,
  GiAranaraState,
  GiCharacter,
  GiCollections,
  GiPlayer,
  GiProgress,
  GiProgressState,
  GiTasks,
  GiWardrobe,
  GiWardrobeKind,
  GoodArtifact,
  GoodCharacter,
  GoodWeapon,
} from '../good'
import { ARANARA_STATES, ARCHIVE_TABS, PROGRESS_STATES, WARDROBE_KINDS } from '../good'
import { sha256Hex128 } from '../hash'
import { compareTuples, deltaDecode, deltaEncode, trimDefaults } from './order'

export type SectionKind =
  | 'characters'
  | 'weapons'
  | 'artifacts'
  | 'materials'
  | 'achievements'
  // irminsul's own keys, each its own section: they change at different
  // rates (the player values on every login, the others rarely), so each
  // deduplicates on its own.
  | 'player'
  | 'achievementTimes'
  | 'characterExtras'
  | 'anecdotes'
  | 'tasks'
  | 'collections'
  // gi_collections' parts from Capture 1.4.0 on: the deployed builds'
  // collections layout cannot learn them (see section-binary.ts).
  | 'collections2'
  | 'wardrobe'

export interface Section {
  kind: SectionKind
  /** Content address: 128-bit SHA-256 of `kind:json`. */
  hash: string
  json: string
}

export async function makeSection(kind: SectionKind, value: unknown): Promise<Section> {
  const json = JSON.stringify(value)
  return { kind, json, hash: await sha256Hex128(`${kind}:${json}`) }
}

const n = (value: KeyRef | undefined, fallback: number): number =>
  typeof value === 'number' ? value : fallback

// ---------------------------------------------------------------- characters
// Row: [character, level, ascension, constellation, auto, skill, burst]

const CHARACTER_DEFAULTS: readonly KeyRef[] = [0, 1, 0, 0, 1, 1, 1]

export function encodeCharacters(characters: readonly GoodCharacter[]): KeyRef[][] {
  return characters
    .map((c) =>
      trimDefaults(
        [
          toRef(CHARACTERS, c.key),
          c.level,
          c.ascension,
          c.constellation,
          c.talent.auto,
          c.talent.skill,
          c.talent.burst,
        ],
        CHARACTER_DEFAULTS,
      ),
    )
    .sort(compareTuples)
}

export function decodeCharacters(rows: readonly KeyRef[][]): GoodCharacter[] {
  return rows.map((row) => ({
    key: fromRef(CHARACTERS, row[0]!),
    level: n(row[1], 1),
    constellation: n(row[3], 0),
    ascension: n(row[2], 0),
    talent: { auto: n(row[4], 1), skill: n(row[5], 1), burst: n(row[6], 1) },
  }))
}

// ------------------------------------------------------------------- weapons
// Row: [weapon, level, ascension, refinement, location character, lock, exp]
// (exp from 2026-10-26; older rows end before it and read as 0)

const WEAPON_DEFAULTS: readonly KeyRef[] = [0, 1, 0, 1, 0, 0, 0]

export function encodeWeapons(weapons: readonly GoodWeapon[]): KeyRef[][] {
  return weapons
    .map((w) =>
      trimDefaults(
        [
          toRef(WEAPONS, w.key),
          w.level,
          w.ascension,
          w.refinement,
          toRef(CHARACTERS, w.location),
          w.lock ? 1 : 0,
          w.gi_exp ?? 0,
        ],
        WEAPON_DEFAULTS,
      ),
    )
    .sort(compareTuples)
}

export function decodeWeapons(rows: readonly KeyRef[][]): GoodWeapon[] {
  return rows.map((row) => ({
    key: fromRef(WEAPONS, row[0]!),
    level: n(row[1], 1),
    ascension: n(row[2], 0),
    refinement: n(row[3], 1),
    location: fromRef(CHARACTERS, row[4] ?? 0),
    lock: row[5] === 1,
    ...(n(row[6], 0) > 0 ? { gi_exp: n(row[6], 0) } : {}),
  }))
}

// ------------------------------------------------------------ bases & deltas
// Materials, artifacts and achievement times change a little on most
// snapshots, so a snapshot usually stores only how its section differs from a
// full "base" section of the same kind (for materials, the "keyframe"), whose
// hash the delta names in `b`. Deltas always point straight at a full base,
// never at another delta, so decoding needs at most two sections and
// snapshots can be imported in any order. A new snapshot is a delta against
// the base of the account's latest snapshot, so the delta is cumulative: it
// grows with each change until storing a new base is cheaper.
//
// When that is: a base costs B bytes (deflated) once, and each later snapshot
// that changes the section stores a delta of about d0 + g·n bytes after n such
// snapshots (d0 ≈ 60 B, mostly the base's hash). Over a run of N snapshots on
// one base, the cost per snapshot is B/N + d0 + g(N+1)/2, lowest at
// N ≈ √(2B/g), where the delta has grown by √(2gB). So a new base is stored
// once the delta passes √(2gB). With g = 25 B (the materials delta's measured
// growth per snapshot) that is ≈ 590 B for a 7 KB materials keyframe, ≈ 635 B
// for an 8 KB achievement-times base and ≈ 245 B for a 1.2 KB artifacts base.
// The optimum is flat: g off by 2x in either direction costs about 6% more,
// so one g serves all three kinds (achievement times grow slower, artifacts
// faster, and the square root already scales the threshold with B).

/** Bytes a delta grows by per changed snapshot, in the base-or-delta cost model above. */
export const DELTA_GROWTH_BYTES = 25

/** True while storing a `deltaBytes` delta beats storing a new `baseBytes` base. */
export function deltaPaysOff(deltaBytes: number, baseBytes: number): boolean {
  return deltaBytes * deltaBytes <= 2 * DELTA_GROWTH_BYTES * baseBytes
}

// ----------------------------------------------------------------- artifacts
// Artifacts themselves live in the per-account catalog; a snapshot stores one
// entry per artifact it held: catalog id, plus the state it had *then*.
// `i` = delta-encoded sorted catalog ids, `l` = location character, `f` = flags.
// Identical pieces share a catalog id, so an id can have several rows.
//
// A delta (`b` set) lists, for every id whose rows differ from the base's,
// all of that id's rows now; an id with no rows left is listed once with
// flags -1. Decoding replaces the base's rows of each listed id.

export interface ArtifactsSection {
  /** Base this delta applies to; absent when the section is full. */
  b?: string
  i: number[]
  l: KeyRef[]
  f: number[]
}

export interface ArtifactRef {
  id: number
  state: ArtifactState
}

/** One stored artifact entry: [catalog id, location, flags]. */
export type ArtifactRow = [number, KeyRef, number]

const LOCK = 1
const ASTRAL_MARK = 2
/**
 * Flags above the two bits hold the piece's EXP toward its next level
 * (`flags >> 2`, from 2026-10-26): rows without EXP are unchanged, and a
 * reader that knows only the two bits still reads them right.
 */
const EXP_UNIT = 4
/** In an artifacts delta, flags of -1 mean the id has no rows any more. */
const NO_ROWS = -1

export function encodeArtifacts(refs: readonly ArtifactRef[]): ArtifactsSection {
  return sectionOfRows(
    refs.map(
      (r): ArtifactRow => [
        r.id,
        toRef(CHARACTERS, r.state.location),
        (r.state.lock ? LOCK : 0) +
          (r.state.astralMark ? ASTRAL_MARK : 0) +
          (r.state.exp ?? 0) * EXP_UNIT,
      ],
    ),
  )
}

/** `full` (a full section) as a delta against the full section `base`. */
export function encodeArtifactsDelta(
  full: ArtifactsSection,
  base: ArtifactsSection,
  baseHash: string,
): ArtifactsSection {
  const now = rowsById(artifactRows(full))
  const before = rowsById(artifactRows(base))
  const rows: ArtifactRow[] = []
  for (const [id, current] of now) {
    if (!sameRows(current, before.get(id))) rows.push(...current)
  }
  for (const id of before.keys()) if (!now.has(id)) rows.push([id, 0, NO_ROWS])
  return { b: baseHash, ...sectionOfRows(rows) }
}

/**
 * Every entry of a section, as its full form lists them (sorted). A delta
 * needs the full section it names as `base`.
 */
export function artifactRows(
  section: ArtifactsSection,
  base: ArtifactsSection | null = null,
): ArtifactRow[] {
  const own = deltaDecode(section.i).map(
    (id, index): ArtifactRow => [id, section.l[index] ?? 0, section.f[index] ?? 0],
  )
  if (section.b === undefined) return own
  if (!base || base.b !== undefined) throw new Error(`Artifacts delta needs base ${section.b}`)
  const listed = new Set(own.map((row) => row[0]))
  return [
    ...artifactRows(base).filter((row) => !listed.has(row[0])),
    ...own.filter((row) => row[2] !== NO_ROWS),
  ].sort(compareTuples)
}

export function decodeArtifacts(
  section: ArtifactsSection,
  catalog: ReadonlyMap<number, ArtifactIdentity>,
  base: ArtifactsSection | null = null,
): GoodArtifact[] {
  return artifactRows(section, base).map(([id, location, flags]) => {
    const identity = catalog.get(id)
    if (!identity) throw new Error(`Artifact ${id} is missing from the catalog`)
    return {
      setKey: identity.setKey,
      slotKey: identity.slotKey,
      level: identity.level,
      rarity: identity.rarity,
      mainStatKey: identity.mainStatKey,
      location: fromRef(CHARACTERS, location),
      lock: (flags & LOCK) !== 0,
      substats: identity.substats,
      totalRolls: identity.totalRolls,
      astralMark: (flags & ASTRAL_MARK) !== 0,
      elixerCrafted: identity.elixerCrafted,
      unactivatedSubstats: identity.unactivatedSubstats,
      ...(flags >= EXP_UNIT ? { gi_exp: Math.floor(flags / EXP_UNIT) } : {}),
    }
  })
}

function sectionOfRows(rows: ArtifactRow[]): ArtifactsSection {
  rows.sort(compareTuples)
  return {
    i: deltaEncode(rows.map((r) => r[0])),
    l: rows.map((r) => r[1]),
    f: rows.map((r) => r[2]),
  }
}

function rowsById(rows: readonly ArtifactRow[]): Map<number, ArtifactRow[]> {
  const byId = new Map<number, ArtifactRow[]>()
  for (const row of rows) {
    const list = byId.get(row[0])
    if (list) list.push(row)
    else byId.set(row[0], [row])
  }
  return byId
}

/** Both lists are sorted (they come from sorted sections). */
function sameRows(a: readonly ArtifactRow[], b: readonly ArtifactRow[] | undefined): boolean {
  return (
    b !== undefined && a.length === b.length && a.every((row, i) => compareTuples(row, b[i]!) === 0)
  )
}

// ----------------------------------------------------------------- materials
// Materials change a little on almost every snapshot (median 3 of ~1,400), so
// most snapshots store only the difference from a full "keyframe" section,
// named by `b` (see "bases & deltas" above). A count of -1 in a delta means
// the key is absent.

export interface MaterialsSection {
  /** Keyframe this delta applies to; absent when this section is a keyframe. */
  b?: string
  m: [KeyRef, number][]
}

export interface MaterialsKeyframe {
  hash: string
  materials: ReadonlyMap<string, number>
}

const REMOVED = -1

export function encodeMaterialsFull(
  materials: ReadonlyMap<string, number>,
  dictionary: KeyDictionary,
): MaterialsSection {
  return { m: sortEntries([...materials].map(([key, count]) => [toRef(dictionary, key), count])) }
}

/**
 * `materials` as a delta against `keyframe`. Compared by key, not by stored
 * ref: a key the dictionary learned since the keyframe was written is a raw
 * string there and an id here, yet the same material.
 */
export function encodeMaterialsDelta(
  materials: ReadonlyMap<string, number>,
  dictionary: KeyDictionary,
  keyframe: MaterialsKeyframe,
): MaterialsSection {
  const delta: [KeyRef, number][] = []
  for (const [key, count] of materials) {
    if (keyframe.materials.get(key) !== count) delta.push([toRef(dictionary, key), count])
  }
  for (const key of keyframe.materials.keys()) {
    if (!materials.has(key)) delta.push([toRef(dictionary, key), REMOVED])
  }
  return { b: keyframe.hash, m: sortEntries(delta) }
}

export function decodeMaterials(
  section: MaterialsSection,
  dictionary: KeyDictionary,
  keyframe: MaterialsSection | null,
): Map<string, number> {
  if (section.b === undefined) return applyEntries(new Map(), section.m, dictionary)
  if (!keyframe || keyframe.b !== undefined) {
    throw new Error(`Materials delta needs keyframe ${section.b}`)
  }
  return applyEntries(applyEntries(new Map(), keyframe.m, dictionary), section.m, dictionary)
}

function applyEntries(
  materials: Map<string, number>,
  entries: readonly [KeyRef, number][],
  dictionary: KeyDictionary,
): Map<string, number> {
  for (const [ref, count] of entries) {
    const key = fromRef(dictionary, ref)
    if (count === REMOVED) materials.delete(key)
    else materials.set(key, count)
  }
  return materials
}

function sortEntries(entries: [KeyRef, number][]): [KeyRef, number][] {
  return entries.sort((a, b) => compareTuples(a, b))
}

// -------------------------------------------------------------- achievements
// Delta-encoded sorted achievement ids (GOOD's `gi_achievements` is a set).

export function encodeAchievements(ids: readonly number[]): number[] {
  return deltaEncode(ids)
}

export function decodeAchievements(deltas: readonly number[]): number[] {
  return deltaDecode(deltas)
}

// -------------------------------------------------------------------- player
// irminsul's `gi_player`, stored as normalizeGood leaves it: an object of the
// fields that passed their checks, keys in a fixed order (normalize's
// PLAYER_FIELDS) so equal values give equal bytes. A few dozen bytes; a new
// field is a new key.

export function decodePlayer(section: GiPlayer): GiPlayer {
  return { ...section }
}

// ---------------------------------------------------------- achievementTimes
// irminsul's `gi_achievement_times`: `i` = delta-encoded sorted achievement
// ids, `t` = each one's finish time in unix seconds. ~1,800 high-entropy
// times make this the largest section, and a snapshot usually adds one or two,
// so it is stored as a delta against a full base like materials (see "bases &
// deltas" above): a delta lists the ids whose time is new or changed, and a
// time of -1 for an id that is gone.

export interface AchievementTimesSection {
  /** Base this delta applies to; absent when the section is full. */
  b?: string
  i: number[]
  t: number[]
}

export function encodeAchievementTimes(
  times: readonly (readonly [number, number])[],
): AchievementTimesSection {
  const sorted = [...times].sort((a, b) => a[0] - b[0])
  return { i: deltaEncode(sorted.map((t) => t[0])), t: sorted.map((t) => t[1]) }
}

/** `full` (a full section) as a delta against the full section `base`. */
export function encodeAchievementTimesDelta(
  full: AchievementTimesSection,
  base: AchievementTimesSection,
  baseHash: string,
): AchievementTimesSection {
  const now = new Map(decodeAchievementTimes(full))
  const before = new Map(decodeAchievementTimes(base))
  const changed: [number, number][] = []
  for (const [id, at] of now) if (before.get(id) !== at) changed.push([id, at])
  for (const id of before.keys()) if (!now.has(id)) changed.push([id, REMOVED])
  return { b: baseHash, ...encodeAchievementTimes(changed) }
}

/**
 * Achievement id -> unix seconds, ascending by id. A delta needs the full
 * section it names as `base`.
 */
export function decodeAchievementTimes(
  section: AchievementTimesSection,
  base: AchievementTimesSection | null = null,
): [number, number][] {
  const own = deltaDecode(section.i).map((id, index): [number, number] => [
    id,
    section.t[index] ?? 0,
  ])
  if (section.b === undefined) return own
  if (!base || base.b !== undefined) {
    throw new Error(`Achievement times delta needs base ${section.b}`)
  }
  const times = new Map(decodeAchievementTimes(base))
  for (const [id, at] of own) {
    if (at === REMOVED) times.delete(id)
    else times.set(id, at)
  }
  return [...times].sort((a, b) => a[0] - b[0])
}

// ----------------------------------------------------------- characterExtras
// irminsul's `gi_characters`. Row: [character, friendship, obtained at (unix
// seconds), exp, friendship exp], 0 where unknown, trailing zeros trimmed
// (the two EXP columns from 2026-10-26).

const CHARACTER_EXTRA_DEFAULTS: readonly KeyRef[] = [0, 0, 0, 0, 0]

export function encodeCharacterExtras(extras: ReadonlyMap<string, GiCharacter>): KeyRef[][] {
  return [...extras]
    .map(([key, extra]) =>
      trimDefaults(
        [
          toRef(CHARACTERS, key),
          extra.friendship ?? 0,
          extra.obtainedAt ?? 0,
          extra.exp ?? 0,
          extra.friendshipExp ?? 0,
        ],
        CHARACTER_EXTRA_DEFAULTS,
      ),
    )
    .sort(compareTuples)
}

export function decodeCharacterExtras(rows: readonly KeyRef[][]): Map<string, GiCharacter> {
  const extras = new Map<string, GiCharacter>()
  for (const row of rows) {
    const extra: GiCharacter = {}
    const friendship = n(row[1], 0)
    const obtainedAt = n(row[2], 0)
    const exp = n(row[3], 0)
    const friendshipExp = n(row[4], 0)
    if (friendship > 0) extra.friendship = friendship
    if (obtainedAt > 0) extra.obtainedAt = obtainedAt
    if (exp > 0) extra.exp = exp
    if (friendshipExp > 0) extra.friendshipExp = friendshipExp
    extras.set(fromRef(CHARACTERS, row[0]!), extra)
  }
  return extras
}

// ----------------------------------------------------------------- anecdotes
// irminsul's `gi_anecdotes`: `i` = delta-encoded sorted anecdote ids, `s` and
// `c` = each one's state and finish count, `a` = the unlocked areas (sorted),
// `r` = the reward track [index, progress, target] and `w` = the last wish
// [npc id (0: none), unix seconds], each only when the capture had it. About
// 160 entries that rarely change, so it is always stored in full (v2
// compresses it against the previous one).

export interface AnecdotesSection {
  i: number[]
  s: number[]
  c: number[]
  a: number[]
  r?: [index: number, progress: number, target: number]
  w?: [npcId: number, lastWishTime: number]
}

export function encodeAnecdotes(anecdotes: GiAnecdotes): AnecdotesSection {
  const entries = Object.entries(anecdotes.anecdotes)
    .map(([id, entry]) => [Number(id), entry] as const)
    .sort((a, b) => a[0] - b[0])
  const section: AnecdotesSection = {
    i: deltaEncode(entries.map((e) => e[0])),
    s: entries.map((e) => e[1].state),
    c: entries.map((e) => e[1].finishCount),
    a: [...anecdotes.unlockedAreas].sort((a, b) => a - b),
  }
  const { reward, wish } = anecdotes
  if (reward) section.r = [reward.index, reward.progress, reward.target]
  if (wish) section.w = [wish.npcId ?? 0, wish.lastWishTime]
  return section
}

export function decodeAnecdotes(section: AnecdotesSection): GiAnecdotes {
  const ids = deltaDecode(section.i)
  const anecdotes: GiAnecdotes = {
    anecdotes: Object.fromEntries(
      ids.map((id, index) => [
        String(id),
        { state: section.s[index] ?? 0, finishCount: section.c[index] ?? 0 },
      ]),
    ),
    unlockedAreas: [...section.a],
  }
  if (section.r) {
    const [index, progress, target] = section.r
    anecdotes.reward = { index, progress, target }
  }
  if (section.w) {
    const [npcId, lastWishTime] = section.w
    anecdotes.wish = npcId > 0 ? { npcId, lastWishTime } : { lastWishTime }
  }
  return anecdotes
}

// --------------------------------------------------------------------- tasks
// irminsul's `gi_tasks`, each part only when the capture had it:
// `c` = commissions [finished, total], `a` = the Abyss [start, end, stars,
// maxStars], `e` = expeditions [[character ('' when unknown), id, start,
// hours, doneAt], ...], `r` = realm currency [value, limit], `w` = Welkin
// days, `p` = the Epitomized Path [weapon, points, max], `n` = resin [value,
// next at] (`p` and `n` from 2026-10-26; the binary layout predates them, so
// a section with them is stored as JSON). A few dozen bytes that change with
// every login: stored in full.

export interface TasksSection {
  c?: [finished: number, total: number]
  a?: [start: number, end: number, stars: number, maxStars: number]
  e?: [character: string, id: number, start: number, hours: number, doneAt: number][]
  r?: [value: number, limit: number]
  w?: number
  p?: [weapon: string, points: number, max: number]
  n?: [value: number, nextAt: number]
}

export function encodeTasks(tasks: GiTasks): TasksSection {
  const section: TasksSection = {}
  const { commissions: c, abyss: a, expeditions: e, realm: r, welkin: w } = tasks
  const { wishPath: p, resin: n } = tasks
  if (c) section.c = [c.finished, c.total]
  if (a) section.a = [a.start, a.end, a.stars, a.maxStars]
  if (e) section.e = e.map((x) => [x.character ?? '', x.id, x.start, x.hours, x.doneAt])
  if (r) section.r = [r.value, r.limit]
  if (w) section.w = w.days
  if (p) section.p = [p.weapon, p.points, p.max]
  if (n) section.n = [n.value, n.nextAt]
  return section
}

export function decodeTasks(section: TasksSection): GiTasks {
  const tasks: GiTasks = {}
  if (section.c) tasks.commissions = { finished: section.c[0], total: section.c[1] }
  if (section.a) {
    const [start, end, stars, maxStars] = section.a
    tasks.abyss = { start, end, stars, maxStars }
  }
  if (section.e) {
    tasks.expeditions = section.e.map(([character, id, start, hours, doneAt]) => ({
      ...(character ? { character } : {}),
      id,
      start,
      hours,
      doneAt,
    }))
  }
  if (section.r) tasks.realm = { value: section.r[0], limit: section.r[1] }
  if (section.w !== undefined) tasks.welkin = { days: section.w }
  if (section.p) tasks.wishPath = { weapon: section.p[0], points: section.p[1], max: section.p[2] }
  if (section.n) tasks.resin = { value: section.n[0], nextAt: section.n[1] }
  return tasks
}

// --------------------------------------------------------------- collections
// Teyvat.me Capture's `gi_collections`, in two sections: `collections` holds
// `s` (what 1.3.0 sent, in the layout the deployed builds decode) and
// `collections2` the parts from 1.4.0 on, in its own binary layout. Both use
// this shape (letters append-only; keys always in this order):
// `s` = the Radiant Spincrystals' item ids, ascending;
// `a` = the Archive: {tab: codex ids ascending}, tabs in ARCHIVE_TABS order;
// `d` = defeats [[Living Beings codex id, defeated, captured (0: none)], ...] by id;
// `h` = the Handbook {c: [[chapter id, progress, total, state]], t: [[quest id,
//       chapter, progress, total, state]]}, both by id, state = PROGRESS_STATES index;
// `r` = Aranara [[type, id, state]] by type then id, state = ARANARA_STATES index;
// `g` = TCG {c: [[card id, count, proficiency (0: none)]] by id, k?: [[deck id,
//       name, valid (1/0), [character cards], [cards]]] by id, u?: current deck};
// `p` = recipes [[recipe id, proficiency]] by id (Capture 1.5.0).
// The game sends all of it at login: a relogin with nothing new stores
// nothing, a few more defeats a few bytes (compressed against the last one).

export type ArchiveSection = Partial<Record<ArchiveTab, number[]>>
export type DefeatRow = [id: number, defeated: number, captured: number]
export type ProgressRow = [id: number, progress: number, total: number, state: number]
export type TargetRow = [
  questId: number,
  chapter: number,
  progress: number,
  total: number,
  state: number,
]
export type AranaraRow = [type: number, id: number, state: number]
export type CardRow = [id: number, count: number, proficiency: number]
export type DeckRow = [
  id: number,
  name: string,
  valid: number,
  characters: number[],
  cards: number[],
]

export interface CollectionsSection {
  s?: number[]
  a?: ArchiveSection
  d?: DefeatRow[]
  h?: { c: ProgressRow[]; t: TargetRow[] }
  r?: AranaraRow[]
  g?: { c: CardRow[]; k?: DeckRow[]; u?: number }
  p?: [id: number, proficiency: number][]
}

const ids = (record: Record<string, unknown>) =>
  Object.keys(record)
    .map(Number)
    .sort((a, b) => a - b)

/** The `collections` section: the Radiant Spincrystals (null without them). */
export function encodeCollections(collections: GiCollections): CollectionsSection | null {
  return collections.spincrystals ? { s: [...collections.spincrystals] } : null
}

/** The `collections2` section: every later part (null when the capture has none). */
export function encodeCollections2(collections: GiCollections): CollectionsSection | null {
  const section: CollectionsSection = {}
  const { archive, defeats, handbook, aranara, tcg, recipes } = collections
  if (archive) {
    const a: ArchiveSection = {}
    for (const tab of ARCHIVE_TABS) if (archive[tab]) a[tab] = [...archive[tab]]
    section.a = a
  }
  if (defeats) {
    section.d = ids(defeats).map((id) => {
      const entry = defeats[String(id)]!
      return [id, entry.defeated, entry.captured ?? 0]
    })
  }
  if (handbook) {
    const state = (s: GiProgressState) => PROGRESS_STATES.indexOf(s)
    section.h = {
      c: ids(handbook.chapters).map((id) => {
        const p = handbook.chapters[String(id)]!
        return [id, p.progress, p.total, state(p.state)]
      }),
      t: ids(handbook.targets).map((id) => {
        const p = handbook.targets[String(id)]!
        return [id, p.chapter, p.progress, p.total, state(p.state)]
      }),
    }
  }
  if (aranara) {
    section.r = ids(aranara).flatMap((type) => {
      const entries = aranara[String(type)]!
      return ids(entries).map(
        (id): AranaraRow => [type, id, ARANARA_STATES.indexOf(entries[String(id)]!)],
      )
    })
  }
  if (tcg) {
    const g: NonNullable<CollectionsSection['g']> = {
      c: ids(tcg.cards).map((id) => {
        const card = tcg.cards[String(id)]!
        return [id, card.count, card.proficiency ?? 0]
      }),
    }
    if (tcg.decks) {
      const decks = tcg.decks
      g.k = ids(decks).map((id) => {
        const deck = decks[String(id)]!
        return [id, deck.name, deck.valid ? 1 : 0, [...deck.characters], [...deck.cards]]
      })
    }
    if (tcg.currentDeck !== undefined) g.u = tcg.currentDeck
    section.g = g
  }
  if (recipes) section.p = ids(recipes).map((id) => [id, recipes[String(id)]!])
  return Object.keys(section).length > 0 ? section : null
}

/**
 * Either section back (each holds its own letters); `gi_collections` is the
 * `collections` one's parts, then the `collections2` one's.
 */
export function decodeCollections(section: CollectionsSection): GiCollections {
  const collections: GiCollections = {}
  if (section.s) collections.spincrystals = [...section.s]
  if (section.a) {
    const archive: ArchiveSection = {}
    for (const tab of ARCHIVE_TABS) if (section.a[tab]) archive[tab] = [...section.a[tab]]
    collections.archive = archive
  }
  if (section.d) {
    collections.defeats = Object.fromEntries(
      section.d.map(([id, defeated, captured]) => [
        String(id),
        captured ? { defeated, captured } : { defeated },
      ]),
    )
  }
  if (section.h) {
    const progress = (p: number, total: number, state: number): GiProgress => ({
      progress: p,
      total,
      state: PROGRESS_STATES[state] ?? 'open',
    })
    collections.handbook = {
      chapters: Object.fromEntries(
        section.h.c.map(([id, p, total, state]) => [String(id), progress(p, total, state)]),
      ),
      targets: Object.fromEntries(
        section.h.t.map(([id, chapter, p, total, state]) => [
          String(id),
          { ...progress(p, total, state), chapter },
        ]),
      ),
    }
  }
  if (section.r) {
    const aranara: Record<string, Record<string, GiAranaraState>> = {}
    for (const [type, id, state] of section.r) {
      ;(aranara[String(type)] ??= {})[String(id)] = ARANARA_STATES[state] ?? 'none'
    }
    collections.aranara = aranara
  }
  if (section.g) {
    const tcg: NonNullable<GiCollections['tcg']> = {
      cards: Object.fromEntries(
        section.g.c.map(([id, count, proficiency]) => [
          String(id),
          proficiency ? { count, proficiency } : { count },
        ]),
      ),
    }
    if (section.g.k) {
      tcg.decks = Object.fromEntries(
        section.g.k.map(([id, name, valid, characters, cards]) => [
          String(id),
          { name, characters: [...characters], cards: [...cards], valid: valid === 1 },
        ]),
      )
    }
    if (section.g.u !== undefined) tcg.currentDeck = section.g.u
    collections.tcg = tcg
  }
  if (section.p) {
    collections.recipes = Object.fromEntries(section.p.map(([id, n]) => [String(id), n]))
  }
  return collections
}

// ------------------------------------------------------------------ wardrobe
// Teyvat.me Capture's `gi_wardrobe`, each part only when the capture had it:
// `o` outfits, `g` gliders, `s` weapon skins, `t` trails, each {o: owned ids
// ascending, w: [[character key, id]] by key, e?: [[id, expires at]] by id};
// `m` = teams [[slot, name, [character keys]]] by slot (names as typed);
// `c` = the team slot in use. Its own section: swapping an outfit or a team
// changes only this one.

export type WardrobeKindSection = {
  o: number[]
  w: [key: string, id: number][]
  e?: [id: number, at: number][]
}
export type TeamRow = [slot: number, name: string, characters: string[]]

export interface WardrobeSection {
  o?: WardrobeKindSection
  g?: WardrobeKindSection
  s?: WardrobeKindSection
  t?: WardrobeKindSection
  m?: TeamRow[]
  c?: number
}

/** Wardrobe kind -> its letter in the section, in WARDROBE_KINDS order. */
const WARDROBE_LETTERS = { outfits: 'o', gliders: 'g', weaponSkins: 's', trails: 't' } as const

export function encodeWardrobe(wardrobe: GiWardrobe): WardrobeSection {
  const section: WardrobeSection = {}
  for (const kind of WARDROBE_KINDS) {
    const value = wardrobe[kind]
    if (!value) continue
    const entry: WardrobeKindSection = {
      o: [...value.owned],
      w: Object.entries(value.worn).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    }
    if (value.expires) {
      const expires = value.expires
      entry.e = ids(expires).map((id) => [id, expires[String(id)]!])
    }
    section[WARDROBE_LETTERS[kind]] = entry
  }
  if (wardrobe.teams) {
    const teams = wardrobe.teams
    section.m = ids(teams).map((slot) => {
      const team = teams[String(slot)]!
      return [slot, team.name, [...team.characters]]
    })
  }
  if (wardrobe.currentTeam !== undefined) section.c = wardrobe.currentTeam
  return section
}

export function decodeWardrobe(section: WardrobeSection): GiWardrobe {
  const wardrobe: GiWardrobe = {}
  for (const kind of WARDROBE_KINDS) {
    const entry = section[WARDROBE_LETTERS[kind]]
    if (!entry) continue
    const value: GiWardrobeKind = { owned: [...entry.o], worn: Object.fromEntries(entry.w) }
    if (entry.e) value.expires = Object.fromEntries(entry.e.map(([id, at]) => [String(id), at]))
    wardrobe[kind] = value
  }
  if (section.m) {
    wardrobe.teams = Object.fromEntries(
      section.m.map(([slot, name, characters]) => [
        String(slot),
        { name, characters: [...characters] },
      ]),
    )
  }
  if (section.c !== undefined) wardrobe.currentTeam = section.c
  return wardrobe
}
