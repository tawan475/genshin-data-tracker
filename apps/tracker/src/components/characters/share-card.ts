/**
 * The share card (ShareCard): its canvas and its own palette, after the
 * "Character Showcase Card" design (Claude Design canvas, dark and light).
 * The card is drawn at 1920×1080 CSS pixels, so the PNG is the card at 1×;
 * the details show it scaled to their width.
 */

import type { InjectionKey } from 'vue'
import type { Element } from '@/data/game-meta'

export const CARD_WIDTH = 1920
export const CARD_HEIGHT = 1080
/** The PNG is the card at 1×: 1920×1080. */
export const CARD_SCALE = 1

/**
 * Provided true by a card drawn for the PNG export: its images show as soon
 * as they load, without the page's fade-in (FadeImage, SplashArt).
 */
export const CARD_STILL: InjectionKey<boolean> = Symbol('card-still')

/** What the card's foot shows of its owner; null parts are left out. */
export interface CardOwner {
  name: string | null
  uid: string | null
  /** Adventure Rank, from the newest capture. */
  ar: number | null
}

export type CardTheme = 'light' | 'dark'

/**
 * The card's palette as CSS variables on its root (the design's values; the
 * app's tokens still apply under its `data-theme`: element, CV tier and
 * rarity colours). `--disc-bg` / `--disc-glow` style ElementDisc.
 */
export const CARD_THEMES: Record<CardTheme, Record<string, string>> = {
  dark: {
    '--card-ground': '#0b1020',
    '--card-text': '#f8fafc',
    '--card-secondary': '#cbd5e1',
    '--card-muted': '#94a3b8',
    '--card-bonus': '#4ade80',
    '--card-hero': '#ffffff',
    '--card-hero-shadow': '0 2px 10px rgba(0,0,0,0.65), 0 1px 2px rgba(0,0,0,0.6)',
    '--card-chip': 'rgba(15,23,42,0.6)',
    '--card-chip-ring': 'inset 0 0 0 1px rgba(255,255,255,0.18)',
    '--card-namecard-filter': 'blur(10px) saturate(1.2) brightness(0.78)',
    '--card-scrim':
      'linear-gradient(90deg, rgba(8,11,22,0.10) 0%, rgba(8,11,22,0.30) 45%, rgba(8,11,22,0.50) 100%)',
    '--card-splash-shadow': 'drop-shadow(0 18px 40px rgba(0,0,0,0.45))',
    '--card-vignette':
      'linear-gradient(0deg, rgba(8,11,22,0.72) 0%, rgba(8,11,22,0) 32%), linear-gradient(180deg, rgba(8,11,22,0.55) 0%, rgba(8,11,22,0) 26%)',
    '--card-panel': 'rgba(12,17,32,0.66)',
    '--card-panel-shadow': '0 8px 24px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.09)',
    '--card-pill': 'rgba(10,14,26,0.82)',
    '--card-badge': '#0f172a',
    '--card-rule': 'rgba(255,255,255,0.08)',
    '--card-divider': 'rgba(255,255,255,0.10)',
    '--card-set-on': '#6ee7b7',
    '--card-set-on-bg': 'rgba(16,185,129,0.18)',
    '--card-set-off-bg': 'rgba(255,255,255,0.07)',
    '--card-cv-bg': 'rgba(255,255,255,0.08)',
    '--card-roll-1': '#64748b',
    '--card-roll-2': '#60a5fa',
    '--card-roll-3': '#a78bfa',
    '--card-roll-4': '#fbbf24',
    '--disc-bg': 'rgba(10,14,26,0.78)',
  },
  light: {
    '--card-ground': '#e8edf5',
    '--card-text': '#0f172a',
    '--card-secondary': '#334155',
    '--card-muted': '#64748b',
    '--card-bonus': '#15803d',
    '--card-hero': '#0f172a',
    '--card-hero-shadow': '0 1px 0 rgba(255,255,255,0.85), 0 0 14px rgba(255,255,255,0.75)',
    '--card-chip': 'rgba(255,255,255,0.8)',
    '--card-chip-ring': 'inset 0 0 0 1px rgba(15,23,42,0.12)',
    '--card-namecard-filter': 'blur(10px) saturate(1.15) brightness(1.12)',
    '--card-scrim':
      'linear-gradient(90deg, rgba(248,250,252,0.20) 0%, rgba(248,250,252,0.32) 45%, rgba(248,250,252,0.50) 100%)',
    '--card-splash-shadow': 'drop-shadow(0 18px 40px rgba(15,23,42,0.22))',
    '--card-vignette':
      'linear-gradient(0deg, rgba(248,250,252,0.62) 0%, rgba(248,250,252,0) 30%), linear-gradient(180deg, rgba(248,250,252,0.50) 0%, rgba(248,250,252,0) 26%)',
    '--card-panel': 'rgba(255,255,255,0.80)',
    '--card-panel-shadow': '0 1px 2px rgba(15,23,42,0.06), inset 0 0 0 1px rgba(15,23,42,0.07)',
    '--card-pill': 'rgba(255,255,255,0.92)',
    '--card-badge': '#ffffff',
    '--card-rule': 'rgba(15,23,42,0.08)',
    '--card-divider': 'rgba(15,23,42,0.10)',
    '--card-set-on': '#047857',
    '--card-set-on-bg': 'rgba(16,185,129,0.14)',
    '--card-set-off-bg': 'rgba(15,23,42,0.06)',
    '--card-cv-bg': 'rgba(15,23,42,0.06)',
    '--card-roll-1': '#94a3b8',
    '--card-roll-2': '#3b82f6',
    '--card-roll-3': '#8b5cf6',
    '--card-roll-4': '#d97706',
    '--disc-bg': 'rgba(30,41,59,0.88)',
    '--disc-glow': '0 4px 14px rgba(15,23,42,0.25)',
  },
}

/**
 * The element colours the card's glow is drawn in: the app's dark-theme
 * element tokens, in both card themes (the design's choice: the light
 * tokens are darkened for text and would muddy the art).
 */
const ELEMENT_GLOW_RGB: Record<Element, string> = {
  pyro: '251,146,60',
  hydro: '56,189,248',
  anemo: '45,212,191',
  electro: '192,132,252',
  dendro: '163,230,53',
  cryo: '103,232,249',
  geo: '250,204,21',
}

/** The element's glow behind the splash, centred under the character. */
export function elementGlow(element: Element, theme: CardTheme): string {
  const rgb = ELEMENT_GLOW_RGB[element]
  const core = theme === 'light' ? 0.32 : 0.3
  return `radial-gradient(ellipse 620px 760px at 340px 560px, rgba(${rgb},${core}) 0%, rgba(${rgb},0.10) 45%, rgba(${rgb},0) 75%)`
}

/** Item backdrops by rarity, as the game's item frames (both themes). */
export const RARITY_GRADIENT: Record<number, string> = {
  5: 'linear-gradient(150deg, #8a5a34 0%, #c98a46 100%)',
  4: 'linear-gradient(150deg, #5a4b84 0%, #9b74c9 100%)',
  3: 'linear-gradient(150deg, #3f5a7e 0%, #5c8ec2 100%)',
  2: 'linear-gradient(150deg, #3f6150 0%, #5f9474 100%)',
  1: 'linear-gradient(150deg, #545a66 0%, #828999 100%)',
}

/** The name's size on the card: 80px, smaller for long names so it fits its column. */
export function nameSize(name: string): number {
  return name.length <= 11 ? 80 : name.length <= 14 ? 66 : 56
}
