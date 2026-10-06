import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_CV_TIERS,
  BUILD_CV_TIERS,
  CRIT_TIER_TEXT,
  RV_TIERS,
  cvTier,
  isCritCirclet,
  rvTier,
} from '../crit-tiers'

describe('artifact CV tiers (akasha.cv)', () => {
  it('starts each tier at its bound', () => {
    const tiers = [0, 7.8, 14.9, 15, 24.9, 25, 34.9, 35, 44.9, 45, 49.9, 50, 54.3, 54.4, 62.2].map(
      (cv) => cvTier(cv),
    )
    expect(tiers).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6])
  })

  it('compares the value as shown, at one decimal', () => {
    expect(cvTier(14.95)).toBe(1)
    expect(cvTier(14.94)).toBe(0)
    expect(cvTier(49.96)).toBe(5)
    expect(cvTier(54.36)).toBe(6)
  })

  it('tiers a CRIT circlet 7.77 higher', () => {
    expect(cvTier(28, 'artifact', true)).toBe(3) // 35.77
    expect(cvTier(28)).toBe(2)
    expect(cvTier(0, 'artifact', true)).toBe(0) // no crit substats: grey
    expect(isCritCirclet('circlet', 'critRate_')).toBe(true)
    expect(isCritCirclet('circlet', 'critDMG_')).toBe(true)
    expect(isCritCirclet('circlet', 'atk_')).toBe(false)
    expect(isCritCirclet('goblet', 'critRate_')).toBe(false)
  })

  it('treats nonsense as grey', () => {
    expect(cvTier(Number.NaN)).toBe(0)
    expect(cvTier(-5)).toBe(0)
  })
})

describe('build CV tiers', () => {
  it('uses the five-piece bounds', () => {
    const tiers = [0, 179.9, 180, 199.9, 200, 220, 240, 259.9, 260, 299.9, 300, 340].map((cv) =>
      cvTier(cv, 'build'),
    )
    expect(tiers).toEqual([0, 0, 1, 1, 2, 3, 4, 4, 5, 5, 6, 6])
    expect(cvTier(54.4, 'build')).toBe(0)
  })
})

describe('RV tiers', () => {
  it('uses akasha’s roll-value bounds', () => {
    const tiers = [0, 340, 350, 450, 540, 550, 650, 740, 750, 890, 900].map(rvTier)
    expect(tiers).toEqual([0, 0, 1, 2, 2, 3, 4, 4, 5, 5, 6])
  })
})

describe('tier tables', () => {
  it('has six rising bounds per scale and a colour per tier', () => {
    for (const bounds of [ARTIFACT_CV_TIERS, BUILD_CV_TIERS, RV_TIERS]) {
      expect(bounds).toHaveLength(6)
      expect([...bounds].sort((a, b) => a - b)).toEqual([...bounds])
    }
    expect(Object.keys(CRIT_TIER_TEXT)).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    expect(CRIT_TIER_TEXT[6]).toContain('cv-glow')
  })
})
