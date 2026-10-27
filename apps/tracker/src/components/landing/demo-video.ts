/**
 * The landing page's demo video (DemoVideo.vue), its pure part: the two
 * recordings' chapters, each chapter's progress at a time, the clock text,
 * which version a visitor starts on and what plays after the end. PC and
 * Android take turns on a desktop; a phone keeps replaying the Android one.
 */

export type DemoPlatform = 'pc' | 'android'

/** A chapter's i18n key (`landing.video.chapter.<key>`) and where it starts, in seconds. */
export interface ChapterMark {
  key: string
  at: number
}

export interface DemoVideo {
  src: string
  poster: string
  /** The file's length, used until the browser reads the real one. */
  duration: number
  chapters: readonly ChapterMark[]
}

export const DEMO_VIDEOS: Readonly<Record<DemoPlatform, DemoVideo>> = {
  pc: {
    src: '/landing/demo-pc.mp4',
    poster: '/landing/demo-pc-poster.jpg',
    duration: 41.77,
    chapters: [
      { key: 'start', at: 0 },
      { key: 'open', at: 3 },
      { key: 'world', at: 20.5 },
      { key: 'captured', at: 30.5 },
      { key: 'site', at: 37 },
    ],
  },
  android: {
    src: '/landing/demo-android.mp4',
    poster: '/landing/demo-android-poster.jpg',
    duration: 25.63,
    chapters: [
      { key: 'startCapture', at: 0 },
      { key: 'open', at: 3.5 },
      { key: 'world', at: 8 },
      { key: 'captured', at: 16.8 },
      { key: 'saved', at: 19.5 },
    ],
  },
}

/** Hold the last frame this long after the end before fading out (ms). */
export const END_HOLD_MS = 900
/** The fade out's length (ms), as `.e-vid.fade`'s transition in landing.css. */
export const FADE_MS = 650
/** After the swap, wait this long before fading back in (the new frame first). */
export const FADE_IN_DELAY_MS = 80
/** Below this share of the video on screen it pauses. */
export const VISIBLE_SHARE = 0.25

/** A phone or tablet: it replays the Android video instead of alternating. */
export const isPhone = (userAgent: string) => /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)

/** The version a visitor starts on: Android on Android, PC elsewhere. */
export const initialPlatform = (userAgent: string): DemoPlatform =>
  /Android/i.test(userAgent) ? 'android' : 'pc'

export interface ChapterState {
  key: string
  start: number
  /** This chapter's own progress, 0–100. */
  fill: number
  state: 'past' | 'current' | 'next'
}

/** Every chapter at time `t` of a video `duration` seconds long. */
export function chapterStates(
  chapters: readonly ChapterMark[],
  t: number,
  duration: number,
): ChapterState[] {
  return chapters.map((chapter, i) => {
    const end = chapters[i + 1]?.at ?? duration
    const current = t >= chapter.at && t < end
    const past = !current && t >= end
    const span = end - chapter.at
    const fill = past
      ? 100
      : current && span > 0
        ? Math.min(100, Math.round(((t - chapter.at) / span) * 100))
        : 0
    return {
      key: chapter.key,
      start: chapter.at,
      fill,
      state: current ? 'current' : past ? 'past' : 'next',
    }
  })
}

/** Seconds as "m:ss". */
export function clock(seconds: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

/**
 * What follows the end: on a phone the Android video again, elsewhere the
 * other version. `null` with reduced motion: it stays on its last frame.
 */
export function afterEnd(
  platform: DemoPlatform,
  { phone, reducedMotion }: { phone: boolean; reducedMotion: boolean },
): DemoPlatform | null {
  if (reducedMotion) return null
  if (phone) return 'android'
  return platform === 'pc' ? 'android' : 'pc'
}
