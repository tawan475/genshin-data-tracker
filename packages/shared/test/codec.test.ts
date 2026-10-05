import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DELTA_GROWTH_BYTES,
  artifactRows,
  decodeAchievementTimes,
  decodeArtifacts,
  decodeSnapshot,
  deflateRaw,
  deltaPaysOff,
  encodeAchievementTimes,
  encodeAchievementTimesDelta,
  encodeArtifactsDelta,
  encodeSnapshot,
  extraSectionsOf,
  inflateRaw,
  normalizeGood,
  prepareSnapshot,
  sectionHashesOf,
  storedSnapshotOf,
  withBases,
  type AchievementTimesSection,
  type ArtifactIdentity,
  type ArtifactsSection,
  type BundleSnapshot,
  type EncodedSnapshot,
  type Good,
  type PreparedSnapshot,
  type Section,
  type SectionBase,
  type SnapshotBases,
  type StoredSnapshot,
} from '../src'
import { MATERIALS } from '../src/dictionary/materials'

/** Stands in for the D1 catalog: assigns ids to new hashes, remembers identities. */
class Catalog {
  readonly ids = new Map<string, number>()
  readonly identities = new Map<number, ArtifactIdentity>()

  add(prepared: PreparedSnapshot): void {
    prepared.artifactHashes.forEach((hash, index) => {
      if (this.ids.has(hash)) return
      const id = this.ids.size + 1
      this.ids.set(hash, id)
      this.identities.set(id, prepared.good.artifacts[index]!.identity)
    })
  }
}

const NO_BASES: SnapshotBases = { materials: null, artifacts: null, achievementTimes: null }

/** Every section a test encoded, by hash: stands in for the blobs table. */
const sectionJson = new Map<string, string>()

function sectionsOf(encoded: EncodedSnapshot): Section[] {
  return [
    encoded.characters,
    encoded.weapons,
    encoded.artifacts,
    encoded.materials,
    ...(encoded.achievements ? [encoded.achievements] : []),
    ...extraSectionsOf(encoded),
  ]
}

/** `section` as a base for later snapshots, sized as it would be stored. */
async function baseOf(section: Section): Promise<SectionBase> {
  sectionJson.set(section.hash, section.json)
  return { hash: section.hash, json: section.json, size: (await deflateRaw(section.json)).length }
}

async function roundTrip(
  input: unknown,
  catalog = new Catalog(),
  bases: Partial<SnapshotBases> = {},
) {
  const prepared = await prepareSnapshot(input)
  catalog.add(prepared)
  const encoded = await withBases(
    await encodeSnapshot(prepared, catalog.ids, MATERIALS),
    prepared,
    MATERIALS,
    { ...NO_BASES, ...bases },
  )
  for (const section of sectionsOf(encoded)) sectionJson.set(section.hash, section.json)
  const decoded = decodeSnapshot(await storedOf(encoded, prepared), catalog.identities, MATERIALS)
  return { prepared, encoded, decoded }
}

/** A snapshot as the server would read it back, every section through deflate and back. */
async function storedOf(
  encoded: EncodedSnapshot,
  prepared: PreparedSnapshot,
): Promise<StoredSnapshot> {
  const base = async (hash: string | null) =>
    hash === null ? null : viaStorage(sectionJson.get(hash)!)
  return {
    format: prepared.good.format,
    version: prepared.good.version,
    source: prepared.good.source,
    takenAt: 1_700_000_000_000,
    characters: await viaStorage(encoded.characters.json),
    weapons: await viaStorage(encoded.weapons.json),
    artifacts: await viaStorage(encoded.artifacts.json),
    artifactsBase: await base(encoded.artifactsBase),
    materials: await viaStorage(encoded.materials.json),
    materialsKeyframe: await base(encoded.materialsBase),
    achievements: await optionalViaStorage(encoded.achievements),
    player: await optionalViaStorage(encoded.player),
    achievementTimes: await optionalViaStorage(encoded.achievementTimes),
    achievementTimesBase: await base(encoded.achievementTimesBase),
    characterExtras: await optionalViaStorage(encoded.characterExtras),
  }
}

async function optionalViaStorage(section: Section | null): Promise<string | null> {
  return section ? viaStorage(section.json) : null
}

/** Every section goes through deflate and back, as it would through D1. */
async function viaStorage(json: string): Promise<string> {
  return inflateRaw(await deflateRaw(json))
}

/**
 * A model of the worker's import (services/import.ts) over an in-memory
 * blobs table: each upload's bases are those of the latest snapshot by capture
 * time, and a section already stored costs nothing. `useBases: false` stores
 * every section in full, as rows written before a section kind could be a
 * delta are.
 */
class Store {
  readonly catalog = new Catalog()
  readonly blobs = new Map<string, { json: string; size: number }>()
  readonly rows: BundleSnapshot[] = []
  storedBytes = 0

  constructor(private readonly useBases = true) {}

  async upload(input: unknown, takenAt: number): Promise<BundleSnapshot> {
    const prepared = await prepareSnapshot(input)
    this.catalog.add(prepared)
    let encoded = await encodeSnapshot(prepared, this.catalog.ids, MATERIALS)
    const latest = this.rows.reduce<BundleSnapshot | null>(
      (newest, row) => (!newest || row.takenAt > newest.takenAt ? row : newest),
      null,
    )
    if (this.useBases && latest) {
      encoded = await withBases(
        encoded,
        prepared,
        MATERIALS,
        {
          materials: this.base(latest.materialsKeyframe),
          artifacts: this.base(latest.artifactsBase ?? latest.artifacts),
          achievementTimes: this.base(latest.achievementTimesBase ?? latest.achievementTimes),
        },
        (hash) => this.blobs.has(hash),
      )
    }
    for (const section of sectionsOf(encoded)) {
      if (this.blobs.has(section.hash)) continue
      const size = (await deflateRaw(section.json)).length
      this.blobs.set(section.hash, { json: section.json, size })
      this.storedBytes += size
    }
    const row: BundleSnapshot = {
      id: this.rows.length + 1,
      takenAt,
      lastSeenAt: takenAt,
      format: prepared.good.format,
      version: prepared.good.version,
      source: prepared.good.source,
      characters: encoded.characters.hash,
      weapons: encoded.weapons.hash,
      artifacts: encoded.artifacts.hash,
      artifactsBase: encoded.artifactsBase,
      materials: encoded.materials.hash,
      materialsKeyframe: encoded.materialsBase ?? encoded.materials.hash,
      achievements: encoded.achievements?.hash ?? null,
      player: encoded.player?.hash ?? null,
      achievementTimes: encoded.achievementTimes?.hash ?? null,
      achievementTimesBase: encoded.achievementTimesBase,
      characterExtras: encoded.characterExtras?.hash ?? null,
    }
    this.rows.push(row)
    return row
  }

  private base(hash: string | null | undefined): SectionBase | null {
    const blob = hash ? this.blobs.get(hash) : undefined
    return blob ? { hash: hash!, ...blob } : null
  }

  /**
   * The GOOD file as the export zip writes it: decoded from the sections the
   * export worker inflates for this snapshot (`sectionHashesOf`) and no others.
   */
  file(row: BundleSnapshot): string {
    const needed = new Set(sectionHashesOf(row))
    const text = (hash: string) => {
      const blob = this.blobs.get(hash)
      if (!needed.has(hash) || !blob) throw new Error(`Missing section ${hash}`)
      return blob.json
    }
    return JSON.stringify(
      decodeSnapshot(storedSnapshotOf(row, text), this.catalog.identities, MATERIALS),
    )
  }
}

/** What a perfect round trip must produce: the normalized input, order-insensitive. */
function expectedGood(input: unknown): Omit<Good, 'timestamp'> {
  const good = normalizeGood(input)
  const expected: Omit<Good, 'timestamp'> = {
    format: good.format,
    version: good.version,
    source: good.source,
    characters: good.characters,
    artifacts: good.artifacts.map(({ identity, state }) => ({
      setKey: identity.setKey,
      slotKey: identity.slotKey,
      level: identity.level,
      rarity: identity.rarity,
      mainStatKey: identity.mainStatKey,
      location: state.location,
      lock: state.lock,
      substats: identity.substats,
      totalRolls: identity.totalRolls,
      astralMark: state.astralMark,
      elixerCrafted: identity.elixerCrafted,
      unactivatedSubstats: identity.unactivatedSubstats,
    })),
    weapons: good.weapons,
    materials: Object.fromEntries(good.materials),
  }
  if (good.achievements) expected.gi_achievements = good.achievements
  if (good.player) expected.gi_player = good.player
  if (good.achievementTimes) {
    expected.gi_achievement_times = Object.fromEntries(
      good.achievementTimes.map(([id, at]) => [String(id), at]),
    )
  }
  if (good.characterExtras) expected.gi_characters = Object.fromEntries(good.characterExtras)
  return expected
}

function canonical(good: Omit<Good, 'timestamp'> & { timestamp?: number }) {
  const sorted = <T>(items: T[]) => items.map((x) => JSON.stringify(x)).sort()
  const { timestamp: _, ...rest } = good
  return {
    ...rest,
    characters: sorted(good.characters),
    artifacts: sorted(good.artifacts),
    weapons: sorted(good.weapons),
    materials: Object.fromEntries(Object.entries(good.materials).sort()),
  }
}

const sample: Good = {
  format: 'GOOD',
  version: 3,
  source: 'Irminsul',
  characters: [
    {
      key: 'Furina',
      level: 90,
      constellation: 2,
      ascension: 6,
      talent: { auto: 6, skill: 10, burst: 10 },
    },
    {
      key: 'SomeoneFromTheNextPatch',
      level: 1,
      constellation: 0,
      ascension: 0,
      talent: { auto: 1, skill: 1, burst: 1 },
    },
  ],
  artifacts: [
    {
      setKey: 'GoldenTroupe',
      slotKey: 'flower',
      level: 20,
      rarity: 5,
      mainStatKey: 'hp',
      location: 'Furina',
      lock: true,
      totalRolls: 9,
      astralMark: true,
      elixerCrafted: false,
      substats: [
        { key: 'critRate_', value: 10.5, initialValue: 3.9 },
        { key: 'critDMG_', value: 21.8, initialValue: 7.8 },
      ],
      unactivatedSubstats: [],
    },
    // Two stat-identical 3★ pieces in different states: one catalog row,
    // two snapshot entries, each keeping its own state.
    {
      setKey: 'Adventurer',
      slotKey: 'plume',
      level: 0,
      rarity: 3,
      mainStatKey: 'atk',
      location: '',
      lock: false,
      substats: [{ key: 'hp', value: 167 }],
    },
    {
      setKey: 'Adventurer',
      slotKey: 'plume',
      level: 0,
      rarity: 3,
      mainStatKey: 'atk',
      location: '',
      lock: true,
      substats: [{ key: 'hp', value: 167 }],
    },
  ],
  weapons: [
    {
      key: 'SplendorOfTranquilWaters',
      level: 90,
      ascension: 6,
      refinement: 1,
      location: 'Furina',
      lock: true,
    },
    { key: 'DullBlade', level: 1, ascension: 0, refinement: 1, location: '', lock: false },
    { key: 'DullBlade', level: 1, ascension: 0, refinement: 1, location: '', lock: false },
  ],
  materials: { Mora: 1_234_567, Primogem: 16_000, MaterialFromTheNextPatch: 3 },
  gi_achievements: [81003, 81001, 81002, 81001],
}

describe('snapshot codec', () => {
  it('round-trips a snapshot, unknown keys and duplicates included', async () => {
    const { decoded } = await roundTrip(sample)
    expect(canonical(decoded)).toEqual(canonical(expectedGood(sample)))
  })

  it('omits achievements when the file had none', async () => {
    const { gi_achievements: _, ...withoutAchievements } = sample
    const { encoded, decoded } = await roundTrip(withoutAchievements)
    expect(encoded.achievements).toBeNull()
    expect(decoded).not.toHaveProperty('gi_achievements')
  })

  it('encodes the same inventory identically whatever the upload order', async () => {
    const shuffled: Good = {
      ...sample,
      characters: [...sample.characters].reverse(),
      artifacts: [...sample.artifacts].reverse(),
      weapons: [...sample.weapons].reverse(),
      gi_achievements: [...sample.gi_achievements!].reverse(),
    }
    const catalog = new Catalog()
    const a = await roundTrip(sample, catalog)
    const b = await roundTrip(shuffled, catalog)
    expect(b.encoded.contentHash).toBe(a.encoded.contentHash)
    expect(b.encoded.artifacts.hash).toBe(a.encoded.artifacts.hash)
  })

  it('stores materials as a delta against a keyframe, removals included', async () => {
    const catalog = new Catalog()
    const big = bigGood()
    const first = await roundTrip(big, catalog)
    expect(first.encoded.materialsBase).toBeNull()
    const keyframe = await baseOf(first.encoded.materials)

    const { [MATERIALS.keys[0]!]: _, ...rest } = big.materials
    const next = { ...big, materials: { ...rest, Mora: 2_000_000, Crystalfly: 1 } }
    const second = await roundTrip(next, catalog, { materials: keyframe })
    expect(second.encoded.materialsBase).toBe(keyframe.hash)
    expect(JSON.parse(second.encoded.materials.json).m).toHaveLength(3)
    expect(second.decoded.materials).toEqual(expectedGood(next).materials)
    // The content hash ignores how materials happened to be stored.
    const asKeyframe = await roundTrip(next, catalog)
    expect(asKeyframe.encoded.materialsBase).toBeNull()
    expect(second.encoded.contentHash).toBe(asKeyframe.encoded.contentHash)
  })

  it('stores a new keyframe once the delta outgrows the cost model', async () => {
    const catalog = new Catalog()
    const big = bigGood()
    const first = await roundTrip(big, catalog)
    const keyframe = await baseOf(first.encoded.materials)
    // Every count changed: the delta is about as large as the keyframe.
    const changed = Object.fromEntries(
      Object.entries(big.materials).map(([key, count]) => [key, count + 1]),
    )
    const second = await roundTrip({ ...big, materials: changed }, catalog, { materials: keyframe })
    expect(second.encoded.materialsBase).toBeNull()
    expect(second.decoded.materials).toEqual(changed)
    // A tiny keyframe never pays for a delta: the base's hash alone outweighs it.
    const tiny = await roundTrip({ ...sample, materials: { Mora: 1 } }, catalog)
    const third = await roundTrip({ ...sample, materials: { Mora: 2 } }, catalog, {
      materials: await baseOf(tiny.encoded.materials),
    })
    expect(third.encoded.materialsBase).toBeNull()
  })

  it('rejects JSON that is not a GOOD file', async () => {
    await expect(prepareSnapshot({ hello: 'world' })).rejects.toThrow(/Not a GOOD file/)
    await expect(prepareSnapshot([])).rejects.toThrow(/JSON object/)
  })

  it('summarizes the figures the dashboard reads', async () => {
    const { prepared } = await roundTrip(sample)
    expect(prepared.summary).toEqual({
      characters: 2,
      weapons: 3,
      artifacts: 3,
      materials: 3,
      mora: 1_234_567,
      primogem: 16_000,
      artifact3: 1,
      artifact4: 0,
    })
  })
})

const extras = {
  gi_player: {
    uid: 813152114,
    ar: 60,
    arExp: 0,
    wl: 8,
    wlLimit: 9,
    resin: 124,
    storyKeys: 3,
    maxStamina: 24000,
    gameData: '792978e5503ecfba73dcb3562ed44a0d35a2abe2',
  },
  gi_achievement_times: { '81003': 1_700_000_300, '81001': 1_650_000_000 },
  gi_characters: {
    Furina: { friendship: 10, obtainedAt: 1_694_000_000 },
    SomeoneFromTheNextPatch: { obtainedAt: 1_760_000_000 },
  },
} satisfies Partial<Good>

describe("irminsul's extra keys", () => {
  it('round-trips gi_player, gi_achievement_times and gi_characters', async () => {
    const withExtras = { ...sample, ...extras }
    const { encoded, decoded } = await roundTrip(withExtras)
    expect(extraSectionsOf(encoded).map((s) => s.kind)).toEqual([
      'player',
      'achievementTimes',
      'characterExtras',
    ])
    expect(canonical(decoded)).toEqual(canonical(expectedGood(withExtras)))
    expect(decoded.gi_player).toEqual(extras.gi_player)
    expect(decoded.gi_achievement_times).toEqual(extras.gi_achievement_times)
    expect(decoded.gi_characters).toEqual(extras.gi_characters)
    // Written after `timestamp`, in irminsul's order.
    expect(Object.keys(decoded).slice(-4)).toEqual([
      'timestamp',
      'gi_player',
      'gi_achievement_times',
      'gi_characters',
    ])
  })

  it('stores and hashes a file without them exactly as before they existed', async () => {
    const old: Good = {
      format: 'GOOD',
      version: 3,
      source: 'Irminsul',
      characters: [
        {
          key: 'Furina',
          level: 90,
          constellation: 2,
          ascension: 6,
          talent: { auto: 6, skill: 10, burst: 10 },
        },
      ],
      artifacts: [
        {
          setKey: 'GoldenTroupe',
          slotKey: 'flower',
          level: 20,
          rarity: 5,
          mainStatKey: 'hp',
          location: 'Furina',
          lock: true,
          substats: [{ key: 'critRate_', value: 10.5 }],
        },
      ],
      weapons: [
        { key: 'DullBlade', level: 1, ascension: 0, refinement: 1, location: '', lock: false },
      ],
      materials: { Mora: 1234567 },
      gi_achievements: [81001, 81002],
    }
    const { encoded, decoded } = await roundTrip(old)
    expect(extraSectionsOf(encoded)).toEqual([])
    // Pinned from the codec before the extras were stored: an unchanged file
    // keeps its content hash, so re-uploading it stays a no-op.
    expect(encoded.contentHash).toBe('27f93f4d1e8fd06ecb09a38d26761421')
    expect(encoded.legacyContentHash).toBe(encoded.contentHash)
    for (const key of ['gi_player', 'gi_achievement_times', 'gi_characters']) {
      expect(decoded).not.toHaveProperty(key)
    }
  })

  it('decodes stored snapshots and bundles written before the extras existed', async () => {
    const { encoded } = await roundTrip(sample)
    const texts = new Map(
      [encoded.characters, encoded.weapons, encoded.artifacts, encoded.materials].map((s) => [
        s.hash,
        s.json,
      ]),
    )
    texts.set(encoded.achievements!.hash, encoded.achievements!.json)
    // A manifest entry as the worker wrote it then: no extra hash fields at all.
    const entry: BundleSnapshot = {
      id: 1,
      takenAt: 1_700_000_000_000,
      lastSeenAt: 1_700_000_000_000,
      format: 'GOOD',
      version: 3,
      source: 'Irminsul',
      characters: encoded.characters.hash,
      weapons: encoded.weapons.hash,
      artifacts: encoded.artifacts.hash,
      materials: encoded.materials.hash,
      materialsKeyframe: encoded.materials.hash,
      achievements: encoded.achievements!.hash,
    }
    const catalog = new Catalog()
    catalog.add(await prepareSnapshot(sample))
    const stored = storedSnapshotOf(entry, (hash) => texts.get(hash)!)
    expect(stored).toMatchObject({ player: null, achievementTimes: null, characterExtras: null })
    const decoded = decodeSnapshot(stored, catalog.identities, MATERIALS)
    expect(canonical(decoded)).toEqual(canonical(expectedGood(sample)))
    expect(Object.keys(decoded).at(-1)).toBe('timestamp')
  })

  it('keeps the inventory hash of a capture stored before the extras', async () => {
    const catalog = new Catalog()
    const before = await roundTrip(sample, catalog)
    const after = await roundTrip({ ...sample, ...extras }, catalog)
    expect(after.encoded.contentHash).not.toBe(before.encoded.contentHash)
    expect(after.encoded.legacyContentHash).toBe(before.encoded.contentHash)
  })

  it('deduplicates each extra on its own, whatever the key order', async () => {
    const catalog = new Catalog()
    const a = await roundTrip({ ...sample, ...extras }, catalog)
    const b = await roundTrip(
      {
        ...sample,
        gi_player: { ...extras.gi_player, resin: 160 },
        gi_achievement_times: Object.fromEntries(
          Object.entries(extras.gi_achievement_times).reverse(),
        ),
        gi_characters: Object.fromEntries(Object.entries(extras.gi_characters).reverse()),
      },
      catalog,
    )
    expect(b.encoded.player!.hash).not.toBe(a.encoded.player!.hash)
    expect(b.encoded.achievementTimes!.hash).toBe(a.encoded.achievementTimes!.hash)
    expect(b.encoded.characterExtras!.hash).toBe(a.encoded.characterExtras!.hash)
    expect(b.encoded.contentHash).not.toBe(a.encoded.contentHash)
    // The order of gi_player's fields in the file does not matter either.
    const shuffled = await roundTrip(
      {
        ...sample,
        ...extras,
        gi_player: Object.fromEntries(Object.entries(extras.gi_player).reverse()),
      },
      catalog,
    )
    expect(shuffled.encoded.player!.hash).toBe(a.encoded.player!.hash)
  })

  it('drops values outside their range and keys with nothing left', () => {
    const good = normalizeGood({
      ...sample,
      gi_player: {
        uid: '813152114', // a string, not a number
        ar: 61,
        arExp: -1,
        wl: 8,
        wlLimit: 10,
        resin: 2001,
        storyKeys: 1.5,
        maxStamina: 0,
        gameData: 'not-hex',
        somethingNew: 1,
      },
      gi_achievement_times: {
        '81001': 1_650_000_000,
        '81002': 1_500_000_000, // before the game existed
        '0': 1_650_000_000,
        abc: 1_650_000_000,
        '81003': 2 ** 32,
        '81004': '1650000000',
      },
      gi_characters: {
        Furina: { friendship: 11, obtainedAt: 1_694_000_000 },
        Bennett: { friendship: 0 },
        Xiangling: 'nope',
        TravelerAnemo: { friendship: 7, obtainedAt: 0, extra: true },
      },
    })
    expect(good.player).toEqual({ wl: 8 })
    expect(good.achievementTimes).toEqual([[81001, 1_650_000_000]])
    expect(good.characterExtras).toEqual(
      new Map([
        ['Furina', { obtainedAt: 1_694_000_000 }],
        ['TravelerAnemo', { friendship: 7 }],
      ]),
    )

    const empty = normalizeGood({
      ...sample,
      gi_player: { gameData: 'abc123' },
      gi_achievement_times: {},
      gi_characters: { Furina: {} },
    })
    expect(empty.player).toBeNull()
    expect(empty.achievementTimes).toBeNull()
    expect(empty.characterExtras).toBeNull()
    expect(normalizeGood({ ...sample, gi_player: [1], gi_characters: null }).player).toBeNull()
  })

  it('keeps the edges of every range', () => {
    const good = normalizeGood({
      ...sample,
      gi_player: { uid: 100_000_000, ar: 1, wl: 0, resin: 2000, maxStamina: 1 },
      gi_characters: { Furina: { friendship: 1, obtainedAt: 1_600_128_000 } },
    })
    expect(good.player).toEqual({ uid: 100_000_000, ar: 1, wl: 0, resin: 2000, maxStamina: 1 })
    expect(good.characterExtras!.get('Furina')).toEqual({
      friendship: 1,
      obtainedAt: 1_600_128_000,
    })
  })
})

const SLOTS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const

/**
 * A larger inventory: deltas only pay off against bases of some size (a tiny
 * section is cheaper to store again than a delta naming it), so the delta
 * tests need real-sized sections. Deterministic, high-entropy times.
 */
function bigGood(): Good {
  const scatter = (i: number, n: number) => ((i * 2_654_435_761) >>> 7) % n
  const artifacts = Array.from({ length: 1000 }, (_, i) => ({
    setKey: 'GoldenTroupe',
    slotKey: SLOTS[i % 5]!,
    level: 20,
    rarity: 5,
    mainStatKey: 'hp',
    location: ['', '', '', 'Furina', 'Bennett', 'Xiangling'][scatter(i, 6)]!,
    lock: scatter(i, 3) !== 0,
    astralMark: scatter(i, 11) === 0,
    substats: [
      { key: 'critRate_', value: 3 + (i % 50) / 10 },
      { key: 'hp', value: 100 + i },
    ],
  }))
  const times = Array.from({ length: 600 }, (_, i): [string, number] => [
    String(81000 + i),
    1_650_000_000 + ((i * 7_919_993) % 120_000_000),
  ])
  return {
    ...sample,
    artifacts: [...sample.artifacts, ...artifacts],
    materials: Object.fromEntries(
      MATERIALS.keys.slice(0, 600).map((key, i) => [key, ((i * 7919) % 5000) + 1]),
    ),
    gi_achievements: times.map(([id]) => Number(id)),
    ...extras,
    gi_achievement_times: Object.fromEntries(times),
  }
}

describe('stored before sections could be deltas', () => {
  // Literal sections in the shape every row before migration 0009 holds (and
  // full sections still have): no `b`, no base hash anywhere.
  const artifacts = '{"i":[1,2,0],"l":[36,0,0],"f":[3,0,1]}'
  const times = '{"i":[81001,2],"t":[1650000000,1700000300]}'

  it('keeps the full forms and content hash byte for byte', async () => {
    const pinned: Good = {
      format: 'GOOD',
      version: 3,
      source: 'Irminsul',
      characters: [sample.characters[0]!],
      artifacts: [
        { ...sample.artifacts[0]!, substats: [{ key: 'critRate_', value: 10.5 }] },
        sample.artifacts[1]!,
        sample.artifacts[2]!,
      ],
      weapons: [sample.weapons[1]!],
      materials: { Mora: 1234567 },
      gi_achievements: [81001, 81002],
      gi_player: { uid: 813152114, ar: 60, wl: 8 },
      gi_achievement_times: { '81003': 1_700_000_300, '81001': 1_650_000_000 },
      gi_characters: { Furina: { friendship: 10, obtainedAt: 1_694_000_000 } },
    }
    const prepared = await prepareSnapshot(pinned)
    const ids = new Map(prepared.artifactHashes.map((hash, i) => [hash, i + 1]))
    const encoded = await encodeSnapshot(prepared, ids, MATERIALS)
    // Pinned from the codec before deltas existed.
    expect(encoded.artifacts.json).toBe(artifacts)
    expect(encoded.artifacts.hash).toBe('258f9006b18f48460b39a8b6c7002a40')
    expect(encoded.achievementTimes!.json).toBe(times)
    expect(encoded.achievementTimes!.hash).toBe('cd3491e5dd5b716f7879c113ed9c0f09')
    expect(encoded.contentHash).toBe('f762cfdc598d02f96e7f7eae3f1392fe')
    expect(encoded.legacyContentHash).toBe('d2a8a9a624e0f70f385ac210fe4eb0c2')
    // No base offered: nothing changes.
    const same = await withBases(encoded, prepared, MATERIALS, NO_BASES)
    expect(same).toEqual(encoded)
  })

  it('decodes old rows and bundle entries without any base field', () => {
    const identity = (setKey: string): ArtifactIdentity => ({
      setKey,
      slotKey: 'flower',
      level: 0,
      rarity: 3,
      mainStatKey: 'hp',
      substats: [],
      totalRolls: 0,
      elixerCrafted: false,
      unactivatedSubstats: [],
    })
    const catalog = new Map([
      [1, identity('A')],
      [3, identity('B')],
    ])
    const old = JSON.parse(artifacts) as ArtifactsSection
    expect(artifactRows(old)).toEqual([
      [1, 36, 3],
      [3, 0, 0],
      [3, 0, 1],
    ])
    expect(
      decodeArtifacts(old, catalog).map((a) => [a.setKey, a.location, a.lock, a.astralMark]),
    ).toEqual([
      ['A', 'Furina', true, true],
      ['B', '', false, false],
      ['B', '', true, false],
    ])
    expect(decodeAchievementTimes(JSON.parse(times))).toEqual([
      [81001, 1_650_000_000],
      [81003, 1_700_000_300],
    ])

    // A bundle entry from before 0009: no artifactsBase / achievementTimesBase keys.
    const entry: BundleSnapshot = {
      id: 1,
      takenAt: 5,
      lastSeenAt: 5,
      format: 'GOOD',
      version: 3,
      source: 'Irminsul',
      characters: 'c',
      weapons: 'w',
      artifacts: 'a',
      materials: 'm',
      materialsKeyframe: 'm',
      achievements: null,
      player: null,
      achievementTimes: 't',
      characterExtras: null,
    }
    const texts = new Map([
      ['c', '[]'],
      ['w', '[]'],
      ['a', artifacts],
      ['m', '{"m":[[3939,7]]}'],
      ['t', times],
    ])
    expect(sectionHashesOf(entry).sort()).toEqual(['a', 'c', 'm', 'm', 't', 'w'])
    const stored = storedSnapshotOf(entry, (hash) => texts.get(hash)!)
    expect(stored).toMatchObject({ artifactsBase: null, achievementTimesBase: null })
    const good = decodeSnapshot(stored, catalog, MATERIALS)
    expect(good.artifacts).toHaveLength(3)
    expect(good.materials).toEqual({ Mora: 7 })
    expect(good.gi_achievement_times).toEqual({ '81001': 1_650_000_000, '81003': 1_700_000_300 })
  })
})

describe('artifacts deltas', () => {
  // Rows: [catalog id, location, flags (1 = lock, 2 = astral mark)].
  // Rows listed in stored order (sorted).
  const section = (sorted: [number, number | string, number][]): ArtifactsSection => {
    let previous = 0
    return {
      i: sorted.map((r) => {
        const d = r[0] - previous
        previous = r[0]
        return d
      }),
      l: sorted.map((r) => r[1]),
      f: sorted.map((r) => r[2]),
    }
  }
  const base = section([
    [1, 0, 0],
    [2, 36, 1],
    [5, 0, 0],
    [5, 0, 1],
    [9, 0, 0],
  ])

  it('lists every row of each changed id, and gone ids once with flags -1', () => {
    const now = section([
      [1, 0, 0], // unchanged
      [2, 36, 3], // astral mark added
      [5, 0, 1], // one of two identical pieces gone (the unlocked one)
      [5, 0, 1], // ... and a new locked copy
      [12, 'SomeoneNew', 0], // new, at a character the dictionary lacks
      // 9 gone
    ])
    const delta = encodeArtifactsDelta(now, base, 'BASE')
    expect(delta.b).toBe('BASE')
    expect(artifactRows({ ...delta, b: undefined })).toEqual([
      [2, 36, 3],
      [5, 0, 1],
      [5, 0, 1],
      [9, 0, -1],
      [12, 'SomeoneNew', 0],
    ])
    expect(artifactRows(delta, base)).toEqual(artifactRows(now))
  })

  it('is empty when nothing changed, and decodes to the base', () => {
    const delta = encodeArtifactsDelta(base, base, 'BASE')
    expect(delta).toEqual({ b: 'BASE', i: [], l: [], f: [] })
    expect(artifactRows(delta, base)).toEqual(artifactRows(base))
  })

  it('refuses to decode a delta without its full base', () => {
    const delta = encodeArtifactsDelta(section([[1, 0, 1]]), base, 'BASE')
    expect(() => artifactRows(delta)).toThrow(/needs base BASE/)
    expect(() => artifactRows(delta, delta)).toThrow(/needs base BASE/)
  })
})

describe('achievement times deltas', () => {
  const base = encodeAchievementTimes([
    [81001, 1_650_000_000],
    [81002, 1_660_000_000],
    [81003, 1_670_000_000],
  ])

  it('lists new and changed times, and -1 for an id that is gone', () => {
    const now = encodeAchievementTimes([
      [81001, 1_650_000_000],
      [81002, 1_660_000_999], // changed
      [81007, 1_680_000_000], // new
      // 81003 gone
    ])
    const delta = encodeAchievementTimesDelta(now, base, 'BASE')
    expect(delta).toEqual({
      b: 'BASE',
      i: [81002, 1, 4],
      t: [1_660_000_999, -1, 1_680_000_000],
    })
    expect(decodeAchievementTimes(delta, base)).toEqual(decodeAchievementTimes(now))
  })

  it('is empty when nothing changed, and decodes to the base', () => {
    const delta = encodeAchievementTimesDelta(base, base, 'BASE')
    expect(delta).toEqual({ b: 'BASE', i: [], t: [] })
    expect(decodeAchievementTimes(delta, base)).toEqual(decodeAchievementTimes(base))
  })

  it('refuses to decode a delta without its full base', () => {
    const delta: AchievementTimesSection = { b: 'BASE', i: [81001], t: [1] }
    expect(() => decodeAchievementTimes(delta)).toThrow(/needs base BASE/)
    expect(() => decodeAchievementTimes(delta, delta)).toThrow(/needs base BASE/)
  })
})

describe('bases', () => {
  it('stores a delta until it passes √(2·g·base)', () => {
    expect(DELTA_GROWTH_BYTES).toBe(25)
    // A 7 KB materials keyframe: deltas up to 591 bytes.
    expect(deltaPaysOff(591, 7000)).toBe(true)
    expect(deltaPaysOff(592, 7000)).toBe(false)
    // An 8 KB achievement-times base: up to 632 bytes.
    expect(deltaPaysOff(632, 8000)).toBe(true)
    expect(deltaPaysOff(633, 8000)).toBe(false)
    // A 1.2 KB artifacts base: up to 244 bytes.
    expect(deltaPaysOff(244, 1200)).toBe(true)
    expect(deltaPaysOff(245, 1200)).toBe(false)
  })

  it('uses a delta only where it is cheaper, never changing the content hash', async () => {
    const catalog = new Catalog()
    const big = bigGood()
    const first = await roundTrip(big, catalog)
    const bases: SnapshotBases = {
      materials: await baseOf(first.encoded.materials),
      artifacts: await baseOf(first.encoded.artifacts),
      achievementTimes: await baseOf(first.encoded.achievementTimes!),
    }

    // Unchanged: every section is its base, stored in full (it costs nothing).
    const same = await roundTrip(big, catalog, bases)
    expect(same.encoded).toEqual(first.encoded)

    // One achievement more and one piece locked: small deltas.
    const next: Good = {
      ...big,
      artifacts: big.artifacts.map((a, i) => (i === 3 ? { ...a, lock: !a.lock } : a)),
      gi_achievement_times: { ...big.gi_achievement_times, '84584': 1_791_189_294 },
    }
    const changed = await roundTrip(next, catalog, bases)
    expect(changed.encoded.artifactsBase).toBe(bases.artifacts!.hash)
    expect(changed.encoded.achievementTimesBase).toBe(bases.achievementTimes!.hash)
    expect(JSON.parse(changed.encoded.achievementTimes!.json)).toEqual({
      b: bases.achievementTimes!.hash,
      i: [84584],
      t: [1_791_189_294],
    })
    expect(canonical(changed.decoded)).toEqual(canonical(expectedGood(next)))
    const inFull = await roundTrip(next, catalog)
    expect(changed.encoded.contentHash).toBe(inFull.encoded.contentHash)
    expect(changed.encoded.legacyContentHash).toBe(inFull.encoded.legacyContentHash)
    expect(JSON.stringify(changed.decoded)).toBe(JSON.stringify(inFull.decoded))

    // Everything different: new bases.
    const other: Good = {
      ...big,
      artifacts: big.artifacts.map((a) => ({ ...a, lock: !a.lock })),
      gi_achievement_times: Object.fromEntries(
        Object.entries(big.gi_achievement_times!).map(([id, at]) => [id, at + 1]),
      ),
    }
    const rebased = await roundTrip(other, catalog, bases)
    expect(rebased.encoded.artifactsBase).toBeNull()
    expect(rebased.encoded.achievementTimesBase).toBeNull()
    expect(canonical(rebased.decoded)).toEqual(canonical(expectedGood(other)))
  })

  it('round-trips a run of uploads, out of order too, to the same files as full storage', async () => {
    const deltas = new Store()
    const inFull = new Store(false)
    const big = bigGood()
    const upload = async (good: Good, takenAt: number) => {
      const row = await deltas.upload(good, takenAt)
      const full = await inFull.upload(good, takenAt)
      // Byte-identical GOOD files whichever way the sections were stored.
      expect(deltas.file(row)).toBe(inFull.file(full))
      return row
    }

    const first = await upload(big, 1_000)
    expect(first).toMatchObject({ artifactsBase: null, achievementTimesBase: null })

    // The base is the latest snapshot's own section.
    const relock = big.artifacts.map((a, i) => (i < 4 ? { ...a, lock: !a.lock } : a))
    const second = await upload(
      {
        ...big,
        artifacts: relock,
        materials: { ...big.materials, Mora: 5 },
        gi_achievement_times: { ...big.gi_achievement_times, '84584': 1_791_189_294 },
      },
      3_000,
    )
    expect(second.artifactsBase).toBe(first.artifacts)
    expect(second.achievementTimesBase).toBe(first.achievementTimes)
    expect(second.materialsKeyframe).toBe(first.materials)

    // Older than the latest: a delta against the latest's bases all the same,
    // with a time changed, one removed and a piece gone.
    const { '81001': _, ...fewer } = big.gi_achievement_times!
    const older = await upload(
      {
        ...big,
        artifacts: big.artifacts.slice(1),
        gi_achievement_times: { ...fewer, '81002': 1_700_000_001 },
      },
      2_000,
    )
    expect(older.artifactsBase).toBe(first.artifacts)
    expect(older.achievementTimesBase).toBe(first.achievementTimes)
    expect(JSON.parse(deltas.blobs.get(older.achievementTimes!)!.json)).toMatchObject({
      i: [81001, 1],
      t: [-1, 1_700_000_001],
    })

    // Only gi_player changed since the latest: its deltas are reused as they are.
    const relogin = await upload(
      {
        ...big,
        artifacts: relock,
        materials: { ...big.materials, Mora: 5 },
        gi_achievement_times: { ...big.gi_achievement_times, '84584': 1_791_189_294 },
        gi_player: { ...extras.gi_player, resin: 1 },
      },
      4_000,
    )
    expect(relogin.artifacts).toBe(second.artifacts)
    expect(relogin.achievementTimes).toBe(second.achievementTimes)
    expect(relogin.materials).toBe(second.materials)

    // Back to the base's exact times: the base itself, in full.
    const back = await upload({ ...big, artifacts: relock }, 5_000)
    expect(back.achievementTimes).toBe(first.achievementTimes)
    expect(back.achievementTimesBase).toBeNull()

    expect(deltas.storedBytes).toBeLessThan(inFull.storedBytes)
  })
})

// Real exports are personal inventory data, so they are never committed. Point
// GDT_GOOD_SAMPLES_DIR at a folder of GOOD files to run these locally.
const samplesDir = process.env.GDT_GOOD_SAMPLES_DIR
describe.skipIf(!samplesDir)('real GOOD exports', () => {
  it('round-trips every file in order, with bases, deltas and section dedup', async () => {
    const files = readdirSync(samplesDir!)
      .filter((f) => f.endsWith('.json'))
      .sort()
    const deltas = new Store()
    const inFull = new Store(false)
    let rawBytes = 0

    for (const [index, file] of files.entries()) {
      const text = readFileSync(join(samplesDir!, file), 'utf8')
      rawBytes += text.length
      const input = JSON.parse(text)
      const takenAt = typeof input.timestamp === 'number' ? input.timestamp : index + 1
      const row = await deltas.upload(input, takenAt)
      const full = await inFull.upload(input, takenAt)
      const decoded = JSON.parse(deltas.file(row))
      expect(canonical(decoded), file).toEqual(canonical(expectedGood(input)))
      expect(deltas.file(row), file).toBe(inFull.file(full))
    }

    const kb = (bytes: number) => (bytes / files.length / 1024).toFixed(1)
    console.log(
      `${files.length} snapshots: ${kb(rawBytes)} KB raw each, sections stored ` +
        `${kb(deltas.storedBytes)} KB each with deltas (${kb(inFull.storedBytes)} KB in full), ` +
        `catalog ${deltas.catalog.ids.size} artifacts`,
    )
  })
})
