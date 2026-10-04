import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MATERIALS_MAX_DELTA,
  decodeSnapshot,
  deflateRaw,
  encodeSnapshot,
  extraSectionsOf,
  withMaterialsKeyframe,
  inflateRaw,
  normalizeGood,
  prepareSnapshot,
  storedSnapshotOf,
  type ArtifactIdentity,
  type BundleSnapshot,
  type EncodedSnapshot,
  type Good,
  type MaterialsKeyframe,
  type PreparedSnapshot,
  type Section,
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

async function roundTrip(
  input: unknown,
  catalog = new Catalog(),
  keyframe: MaterialsKeyframe | null = null,
) {
  const prepared = await prepareSnapshot(input)
  catalog.add(prepared)
  const encoded = await withMaterialsKeyframe(
    await encodeSnapshot(prepared, catalog.ids, MATERIALS),
    prepared,
    MATERIALS,
    keyframe,
  )
  const decoded = decodeSnapshot(
    {
      format: prepared.good.format,
      version: prepared.good.version,
      source: prepared.good.source,
      takenAt: 1_700_000_000_000,
      characters: await viaStorage(encoded.characters.json),
      weapons: await viaStorage(encoded.weapons.json),
      artifacts: await viaStorage(encoded.artifacts.json),
      materials: await viaStorage(encoded.materials.json),
      materialsKeyframe: keyframe ? await viaStorage(keyframeJson.get(keyframe.hash)!) : null,
      achievements: await optionalViaStorage(encoded.achievements),
      player: await optionalViaStorage(encoded.player),
      achievementTimes: await optionalViaStorage(encoded.achievementTimes),
      characterExtras: await optionalViaStorage(encoded.characterExtras),
    },
    catalog.identities,
    MATERIALS,
  )
  return { prepared, encoded, decoded }
}

async function optionalViaStorage(section: Section | null): Promise<string | null> {
  return section ? viaStorage(section.json) : null
}

const keyframeJson = new Map<string, string>()

function keyframeOf(encoded: EncodedSnapshot, prepared: PreparedSnapshot): MaterialsKeyframe {
  keyframeJson.set(encoded.materials.hash, encoded.materials.json)
  return { hash: encoded.materials.hash, materials: prepared.good.materials }
}

/** Every section goes through deflate and back, as it would through D1. */
async function viaStorage(json: string): Promise<string> {
  return inflateRaw(await deflateRaw(json))
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
    // Two stat-identical fodder pieces in different states: one catalog row,
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
    const first = await roundTrip(sample, catalog)
    expect(first.encoded.materialsIsKeyframe).toBe(true)
    const keyframe = keyframeOf(first.encoded, first.prepared)

    const { MaterialFromTheNextPatch: _, ...rest } = sample.materials
    const next = { ...sample, materials: { ...rest, Mora: 2_000_000, Crystalfly: 1 } }
    const second = await roundTrip(next, catalog, keyframe)
    expect(second.encoded.materialsIsKeyframe).toBe(false)
    expect(JSON.parse(second.encoded.materials.json).m).toHaveLength(3)
    expect(second.decoded.materials).toEqual(expectedGood(next).materials)
    // The content hash ignores how materials happened to be stored.
    const asKeyframe = await roundTrip(next, catalog)
    expect(second.encoded.contentHash).toBe(asKeyframe.encoded.contentHash)
  })

  it('falls back to a new keyframe when the delta grows too large', async () => {
    const many = Object.fromEntries(
      Array.from({ length: MATERIALS_MAX_DELTA + 1 }, (_, i) => [`Item${i}`, i]),
    )
    const catalog = new Catalog()
    const first = await roundTrip({ ...sample, materials: {} }, catalog)
    const second = await roundTrip(
      { ...sample, materials: many },
      catalog,
      keyframeOf(first.encoded, first.prepared),
    )
    expect(second.encoded.materialsIsKeyframe).toBe(true)
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
      fodder3: 1,
      fodder4: 0,
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

// Real exports are personal inventory data, so they are never committed. Point
// GDT_GOOD_SAMPLES_DIR at a folder of GOOD files to run these locally.
const samplesDir = process.env.GDT_GOOD_SAMPLES_DIR
describe.skipIf(!samplesDir)('real GOOD exports', () => {
  it('round-trips every file in order, with keyframes and section dedup', async () => {
    const files = readdirSync(samplesDir!)
      .filter((f) => f.endsWith('.json'))
      .sort()
    const catalog = new Catalog()
    const stored = new Map<string, number>()
    let keyframe: MaterialsKeyframe | null = null
    let rawBytes = 0

    for (const file of files) {
      const text = readFileSync(join(samplesDir!, file), 'utf8')
      rawBytes += text.length
      const input = JSON.parse(text)
      const { prepared, encoded, decoded } = await roundTrip(input, catalog, keyframe)
      expect(canonical(decoded), file).toEqual(canonical(expectedGood(input)))

      if (encoded.materialsIsKeyframe) keyframe = keyframeOf(encoded, prepared)
      const sections = [
        encoded.characters,
        encoded.weapons,
        encoded.artifacts,
        encoded.materials,
        encoded.achievements,
        ...extraSectionsOf(encoded),
      ]
      for (const section of sections) {
        if (section && !stored.has(section.hash)) {
          stored.set(section.hash, (await deflateRaw(section.json)).length)
        }
      }
    }

    const sectionBytes = [...stored.values()].reduce((a, b) => a + b, 0)
    console.log(
      `${files.length} snapshots: ${(rawBytes / files.length / 1024).toFixed(0)} KB raw each, ` +
        `${(sectionBytes / files.length / 1024).toFixed(1)} KB stored each (sections), ` +
        `catalog ${catalog.ids.size} artifacts`,
    )
  })
})
