import { describe, expect, it } from 'vitest'
import {
  afterEnd,
  chapterStates,
  clock,
  DEMO_VIDEOS,
  initialPlatform,
  isPhone,
} from '../demo-video'

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('demo video', () => {
  it('starts on Android only on Android', () => {
    expect(initialPlatform(ANDROID_UA)).toBe('android')
    expect(initialPlatform(IPHONE_UA)).toBe('pc')
    expect(initialPlatform(WINDOWS_UA)).toBe('pc')
  })

  it('knows phones', () => {
    expect(isPhone(ANDROID_UA)).toBe(true)
    expect(isPhone(IPHONE_UA)).toBe(true)
    expect(isPhone(WINDOWS_UA)).toBe(false)
  })

  it('alternates on a desktop and replays Android on a phone', () => {
    const desktop = { phone: false, reducedMotion: false }
    expect(afterEnd('pc', desktop)).toBe('android')
    expect(afterEnd('android', desktop)).toBe('pc')
    const phone = { phone: true, reducedMotion: false }
    expect(afterEnd('pc', phone)).toBe('android')
    expect(afterEnd('android', phone)).toBe('android')
    expect(afterEnd('pc', { phone: false, reducedMotion: true })).toBeNull()
  })

  it('fills the chapters up to the time', () => {
    const { chapters, duration } = DEMO_VIDEOS.pc
    const at = (t: number) => chapterStates(chapters, t, duration)
    expect(at(0).map((c) => c.state)).toEqual(['current', 'next', 'next', 'next', 'next'])
    expect(at(0)[0]!.fill).toBe(0)
    // 1.5 s into "Start the app" (0–3 s): half way.
    expect(at(1.5)[0]!.fill).toBe(50)
    const mid = at(25.5)
    expect(mid.map((c) => c.state)).toEqual(['past', 'past', 'current', 'next', 'next'])
    expect(mid.map((c) => c.fill)).toEqual([100, 100, 50, 0, 0])
    // A chapter starts exactly at its mark.
    expect(at(37)[4]!.state).toBe('current')
    // At the end every chapter is full.
    expect(at(duration).map((c) => c.fill)).toEqual([100, 100, 100, 100, 100])
    expect(at(duration).every((c) => c.state === 'past')).toBe(true)
  })

  it('keeps every chapter inside its video', () => {
    for (const video of Object.values(DEMO_VIDEOS)) {
      const starts = video.chapters.map((c) => c.at)
      expect(starts[0]).toBe(0)
      expect([...starts].sort((a, b) => a - b)).toEqual(starts)
      expect(starts.at(-1)!).toBeLessThan(video.duration)
    }
  })

  it('writes the clock as m:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(12.9)).toBe('0:12')
    expect(clock(41.77)).toBe('0:41')
    expect(clock(61)).toBe('1:01')
    expect(clock(Number.NaN)).toBe('0:00')
    expect(clock(-3)).toBe('0:00')
  })
})
