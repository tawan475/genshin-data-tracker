import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MATERIALS_MAX_DELTA,
  decodeSnapshot,
  deflateRaw,
  encodeSnapshot,
  withMaterialsKeyframe,
  inflateRaw,
  normalizeGood,
  prepareSnapshot,
  type ArtifactIdentity,
  type EncodedSnapshot,
  type Good,
  type MaterialsKeyframe,
  type PreparedSnapshot,
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
      achievements: encoded.achievements ? await viaStorage(encoded.achievements.json) : null,
    },
    catalog.identities,
    MATERIALS,
  )
  return { prepared, encoded, decoded }
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
