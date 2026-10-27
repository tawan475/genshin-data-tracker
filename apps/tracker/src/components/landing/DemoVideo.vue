<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { Maximize, Monitor, Pause, Play, Smartphone } from 'lucide-vue-next'
import {
  afterEnd,
  chapterStates,
  clock,
  DEMO_VIDEOS,
  END_HOLD_MS,
  FADE_IN_DELAY_MS,
  FADE_MS,
  initialPlatform,
  isPhone,
  VISIBLE_SHARE,
  type DemoPlatform,
} from './demo-video'

/**
 * The hero's demo: the capture app on PC or Android (logic in demo-video.ts).
 * Muted autoplay without loop; it pauses while less than a quarter is on
 * screen and resumes unless the visitor paused it. At the end it holds the
 * last frame, fades, and plays the other version (a phone replays Android).
 * The file loads only once the player nears the screen. Reduced motion: no
 * autoplay, no fades. The recordings have no sound: always muted, no volume
 * control.
 */
const userAgent = navigator.userAgent
const phone = isPhone(userAgent)
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const platform = ref<DemoPlatform>(initialPlatform(userAgent))
const time = ref(0)
const duration = ref(0)
const playing = ref(false)
const fading = ref(false)
/** Between the end and the next version's start: no big play button over the held frame. */
const ending = ref(false)
/** The player has come near the screen: the video may load. */
const near = ref(false)

const root = ref<HTMLElement>()
const frame = ref<HTMLElement>()
const video = shallowRef<HTMLVideoElement>()
/** The visitor paused it: scrolling back into view doesn't resume it. */
let userPaused = false
/** At least a quarter of it is on screen. */
let inView = false
/** The next play was asked for by the visitor (it may start while mostly off screen). */
let asked = false
let timers: ReturnType<typeof setTimeout>[] = []
let visibility: IntersectionObserver | undefined
let nearness: IntersectionObserver | undefined

const info = computed(() => DEMO_VIDEOS[platform.value])
const length = computed(() => duration.value || info.value.duration)
const shown = computed(() => Math.min(time.value, length.value))
const chapters = computed(() => chapterStates(info.value.chapters, shown.value, length.value))
const percent = computed(() =>
  length.value ? Math.round((shown.value / length.value) * 1000) / 10 : 0,
)
/** The progress bar's screen-reader value (no time is shown). */
const timeText = computed(() => `${clock(shown.value)} / ${clock(length.value)}`)

function later(ms: number, run: () => void) {
  timers.push(setTimeout(run, ms))
}
/** Cancels a pending end-of-video fade (and shows the video again). */
function cancelFade() {
  timers.forEach(clearTimeout)
  timers = []
  fading.value = false
  ending.value = false
}

/** Plays at the visitor's request (a button, a chapter, the video itself). */
function play() {
  near.value = true
  asked = true
  void video.value?.play().catch(() => undefined)
}
/** Plays on its own: unless paused by the visitor, off screen, finished or reduced motion. */
function maybePlay() {
  const element = video.value
  if (!element || userPaused || !inView || reducedMotion || element.ended) return
  void element.play().catch(() => undefined)
}
/** Full screen hides the page around the video: its visibility doesn't count then. */
const onScreen = () => inView || !!document.fullscreenElement

/** A new <video> (one per version, keyed): set up, then play if it should. */
function attach(element: HTMLVideoElement | undefined) {
  // A version switch unmounts the old <video> after the new one is attached,
  // and its ref then reports null: keep the new one (only a video that has
  // left the page is let go). Without this the controls lost the video and
  // the play button stuck.
  if (!element) {
    if (video.value && !video.value.isConnected) video.value = undefined
    return
  }
  // Function refs run on every render: only a new element counts.
  if (element === video.value) return
  video.value = element
  element.muted = true
  element.defaultMuted = true
  maybePlay()
}

/**
 * Whether an event comes from the video on show. Switching versions removes
 * the old <video>, and the browser then fires its `pause` late, after the new
 * one has started: without this check that marked the playing video paused
 * (the big play button stuck over it).
 */
const current = (event: Event) => event.target === video.value

/** Autoplay starts as soon as the file loads, which may be before it is on screen. */
function onPlay(event: Event) {
  if (!current(event)) return
  if (!asked && !onScreen()) {
    video.value?.pause()
    return
  }
  asked = false
  playing.value = true
}

function pick(next: DemoPlatform, automatic = false) {
  if (!automatic) cancelFade()
  if (next === platform.value) return
  userPaused = false
  platform.value = next
  time.value = 0
  duration.value = 0
  playing.value = false
}

function onPause(event: Event) {
  if (current(event)) playing.value = false
}

function onEnded(event: Event) {
  if (!current(event)) return
  cancelFade()
  const next = afterEnd(platform.value, { phone, reducedMotion })
  if (!next) return
  ending.value = true
  later(END_HOLD_MS, () => {
    fading.value = true
    later(FADE_MS, () => {
      if (next === platform.value) {
        const element = video.value
        if (element) element.currentTime = 0
        time.value = 0
        maybePlay()
      } else {
        pick(next, true)
      }
      later(FADE_IN_DELAY_MS, () => {
        fading.value = false
        ending.value = false
      })
    })
  })
}

function toggle() {
  const element = video.value
  if (!element) return
  if (element.paused) {
    userPaused = false
    cancelFade()
    play()
  } else {
    userPaused = true
    element.pause()
  }
}

function jump(seconds: number) {
  cancelFade()
  const element = video.value
  if (!element) return
  element.currentTime = seconds
  time.value = seconds
  userPaused = false
  play()
}

function seek(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  cancelFade()
  if (video.value) video.value.currentTime = value
  time.value = value
}

function fullScreen() {
  const element = video.value as
    | (HTMLVideoElement & {
        webkitRequestFullscreen?: () => void
        webkitEnterFullscreen?: () => void
      })
    | undefined
  if (!element) return
  const enter =
    element.requestFullscreen ?? element.webkitRequestFullscreen ?? element.webkitEnterFullscreen
  if (enter) void Promise.resolve(enter.call(element)).catch(() => undefined)
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    near.value = true
    inView = true
    return
  }
  nearness = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      near.value = true
      nearness?.disconnect()
    },
    { rootMargin: '300px 0px' },
  )
  if (root.value) nearness.observe(root.value)
  visibility = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]!
      inView = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_SHARE
      if (!video.value || document.fullscreenElement) return
      if (!inView) video.value.pause()
      else maybePlay()
    },
    { threshold: [0, VISIBLE_SHARE, 0.5, 1] },
  )
  if (frame.value) visibility.observe(frame.value)
})

onBeforeUnmount(() => {
  visibility?.disconnect()
  nearness?.disconnect()
  cancelFade()
})
</script>

<template>
  <div id="video" ref="root" class="e-player" role="group" :aria-label="$t('landing.video.label')">
    <div class="e-seg" role="group" :aria-label="$t('landing.video.platform')">
      <button
        type="button"
        :class="{ on: platform === 'pc' }"
        :aria-pressed="platform === 'pc'"
        @click="pick('pc')"
      >
        <Monitor class="ic s" aria-hidden="true" />PC
      </button>
      <button
        type="button"
        :class="{ on: platform === 'android' }"
        :aria-pressed="platform === 'android'"
        @click="pick('android')"
      >
        <Smartphone class="ic s" aria-hidden="true" />Android
      </button>
    </div>
    <div class="e-stage" :class="platform === 'android' ? 'phone' : 'pc'">
      <div
        ref="frame"
        class="e-vid"
        :class="[platform === 'android' ? 'phone' : 'pc', { paused: !playing, fade: fading }]"
      >
        <video
          :key="platform"
          :ref="(element) => attach((element as HTMLVideoElement | null) ?? undefined)"
          class="e-v"
          :src="near ? info.src : undefined"
          :poster="info.poster"
          muted
          :autoplay="!reducedMotion"
          playsinline
          preload="metadata"
          :aria-label="
            platform === 'android' ? $t('landing.video.androidLabel') : $t('landing.video.pcLabel')
          "
          @click="toggle"
          @timeupdate="current($event) && (time = ($event.target as HTMLVideoElement).currentTime)"
          @loadedmetadata="
            current($event) && (duration = ($event.target as HTMLVideoElement).duration || 0)
          "
          @play="onPlay"
          @pause="onPause"
          @ended="onEnded"
        />
        <button
          v-if="!playing && !ending"
          type="button"
          class="e-big"
          :aria-label="$t('landing.video.play')"
          @click="toggle"
        >
          <Play class="ic f" aria-hidden="true" />
        </button>
        <div class="e-ctl">
          <button
            type="button"
            class="e-cb"
            :aria-label="playing ? $t('landing.video.pause') : $t('landing.video.play')"
            @click="toggle"
          >
            <Pause v-if="playing" class="ic f" aria-hidden="true" />
            <Play v-else class="ic f" aria-hidden="true" />
          </button>
          <input
            class="e-seek"
            type="range"
            min="0"
            :max="length"
            step="0.1"
            :value="shown"
            :style="{ '--p': `${percent}%` }"
            :aria-label="$t('landing.video.seek')"
            :aria-valuetext="timeText"
            @input="seek"
          />
          <button
            type="button"
            class="e-cb"
            :aria-label="$t('landing.video.fullScreen')"
            @click="fullScreen"
          >
            <Maximize class="ic s" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ol class="e-chaps" :aria-label="$t('landing.video.chapters')">
        <li v-for="chapter in chapters" :key="`${platform}-${chapter.key}`">
          <button
            type="button"
            class="e-chap"
            :class="chapter.state"
            :aria-current="chapter.state === 'current' ? 'step' : undefined"
            @click="jump(chapter.start)"
          >
            <b>{{ $t(`landing.video.chapter.${chapter.key}`) }}</b>
            <span class="bar" aria-hidden="true"><i :style="{ '--f': `${chapter.fill}%` }" /></span>
          </button>
        </li>
      </ol>
    </div>
  </div>
</template>
