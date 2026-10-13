import { describe, expect, it } from 'vitest'
import { captureTimeFromName } from '../capture-time-name'

const local = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime()

describe('captureTimeFromName', () => {
  it('reads the names exporters and forks write', () => {
    expect(captureTimeFromName('genshin_export_2026-06-20_13-19-18.json')).toBe(
      local(2026, 6, 20, 13, 19, 18),
    )
    expect(captureTimeFromName('genshin_export_2026-08-15_10-25.json')).toBe(
      local(2026, 8, 15, 10, 25),
    )
    expect(captureTimeFromName('export 2026-08-15T10:25:07.json')).toBe(
      local(2026, 8, 15, 10, 25, 7),
    )
  })

  it('refuses names without a plausible date and time', () => {
    for (const name of [
      'genshin_export.json',
      'genshin_export_2026-06-20.json',
      'genshin_export_2026-13-01_10-00.json',
      'genshin_export_2026-06-31_10-00.json',
      'genshin_export_2026-06-20_24-00.json',
      'genshin_export_1999-06-20_10-00.json',
    ]) {
      expect(captureTimeFromName(name)).toBeNull()
    }
  })
})
