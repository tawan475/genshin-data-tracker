/**
 * What the build card (share-card-canvas) and the team card
 * (team-card-canvas) paint alike: text in the card's Outfit, glass panels
 * and chips, the element discs, the game's item art, gold stars. Each card
 * extends it with its own layout; sizes and places are the caller's.
 */

import type { DamageKind } from '@/data/character-build'
import type { Element } from '@/data/game-meta'
import { ELEMENT_GLYPHS } from '@/components/ui/element-glyphs'
import {
  CardImages,
  Painter,
  iconPath,
  linearGradient,
  parseInsetRing,
  parseShadows,
  themeTokens,
  type Shadow,
} from '@/lib/card-canvas'
import {
  CARD_THEMES,
  EMBLEM_URL,
  RARITY_GRADIENT,
  qualityArt,
  type CardTheme,
  type EmblemBox,
} from './share-card'
import type { BandTone } from './share-card-model'

/** CSS's `line-height: 1.5` (the card's inherited line height). */
export const LH = 1.5

export const STAR =
  'M12 1.8l2.95 6.6 7.2.75-5.4 4.85 1.53 7.08L12 17.4l-6.28 3.68 1.53-7.08-5.4-4.85 7.2-.75z'
const LOCK =
  'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4'
export const STAR_SHADOW: Shadow = { x: 0, y: 1, blur: 2, color: 'rgba(80,50,0,0.5)' }
export const BAND_SHADE = 'rgba(30,16,4,0.5)'
/** A roll bar's height by its quality (1-4), of the full bar. */
export const ROLL_TIER: Record<number, number> = { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1 }

const TOKENS = [
  'element-pyro',
  'element-hydro',
  'element-anemo',
  'element-electro',
  'element-dendro',
  'element-cryo',
  'element-geo',
  'element-physical',
  'talent-crown',
  'talent-silver',
  'talent-boost',
  'game-star',
  'game-star-edge',
  'surface-raised',
  'text-muted',
  'accent-ink',
  'cv-0',
  'cv-1',
  'cv-2',
  'cv-3',
  'cv-4',
  'cv-5',
  'cv-6',
] as const
export type Tokens = Record<(typeof TOKENS)[number], string>

export class CardPaint {
  protected readonly ctx: CanvasRenderingContext2D
  /** The card's palette (share-card CARD_THEMES); a card may override a value. */
  protected readonly theme: Record<string, string>
  protected readonly tokens: Tokens
  /** The card painted so far, for the panels' backdrop blur (set by the card). */
  protected backdropCopy: HTMLCanvasElement | null = null
  protected readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(
    protected readonly p: Painter,
    protected readonly cardTheme: CardTheme,
    protected readonly images: CardImages,
    protected readonly family: string,
  ) {
    this.ctx = p.ctx
    this.theme = { ...CARD_THEMES[cardTheme] }
    this.tokens = themeTokens(cardTheme, TOKENS)
  }

  protected v(name: string): string {
    return this.theme[name] ?? ''
  }

  protected elementColor(element: Element | null): string {
    return element ? this.tokens[`element-${element}`] : this.tokens['text-muted']
  }

  protected damageColor(kind: DamageKind): string {
    return this.tokens[`element-${kind}`]
  }

  /** Text in the card's tabular Outfit: `weight size`, the line box's top and height. */
  protected line(
    text: string,
    x: number,
    top: number,
    size: number,
    weight: number,
    color: string,
    options: {
      lineHeight?: number
      align?: CanvasTextAlign
      alpha?: number
      shadows?: readonly Shadow[]
      max?: number
    } = {},
  ): number {
    this.p.font(weight, size, this.family)
    const shown = options.max !== undefined ? this.p.ellipsize(text, options.max) : text
    const y = this.p.baseline(top, options.lineHeight ?? size * LH)
    return this.p.text(shown, x, y, color, options)
  }

  protected textWidth(text: string, size: number, weight: number): number {
    this.p.font(weight, size, this.family)
    return this.p.measure(text)
  }

  /** The tier colour of a CV / RV, and the reduced-motion glow of the top tier (cv-glow). */
  protected tier(tier: number): { color: string; shadows?: Shadow[] } {
    const color = this.tokens[`cv-${tier}` as keyof Tokens]
    return tier === 6 && this.reducedMotion
      ? { color, shadows: [{ x: 0, y: 0, blur: 2, color }] }
      : { color }
  }

  protected glow(tone: BandTone | null, color: string): Shadow[] | undefined {
    return tone?.top && this.reducedMotion ? [{ x: 0, y: 0, blur: 2, color }] : undefined
  }

  /** A panel: its shadow, the art blurred behind it, its fill and hairline. */
  protected glass(x: number, y: number, w: number, h: number, r: number, kind: 'panel' | 'chip') {
    const p = this.p
    const shadows = this.v(kind === 'panel' ? '--card-panel-shadow' : '--card-chip-ring')
    for (const shadow of parseShadows(shadows)) p.boxShadow(x, y, w, h, r, shadow)
    if (this.backdropCopy) {
      p.backdrop(
        this.backdropCopy,
        { x, y, w, h, r },
        kind === 'panel' ? 16 : 10,
        kind === 'panel' ? 1.2 : 1,
      )
    }
    p.fill(x, y, w, h, r, this.v(kind === 'panel' ? '--card-panel' : '--card-chip'))
    const ring = parseInsetRing(shadows)
    if (ring) p.insetRing(x, y, w, h, r, ring.width, ring.color)
  }

  /** ElementDisc: a glyph on the dark disc, the element's ring and glow; `locked` dims it. */
  protected disc(
    x: number,
    y: number,
    d: number,
    src: string,
    glyph: number | null,
    locked: boolean,
    fallback: string,
    element: Element | null,
  ) {
    const { p, ctx } = this
    const color = this.elementColor(element)
    const r = d / 2
    if (!locked) {
      const glow = this.theme['--disc-glow']
      p.boxShadow(
        x,
        y,
        d,
        d,
        r,
        glow
          ? parseShadows(glow)[0]!
          : { x: 0, y: 0, blur: Math.round(d / 5), color: withAlpha(color, 0.3) },
      )
    }
    p.fill(x, y, d, d, r, this.v('--disc-bg') || 'rgba(10, 14, 26, 0.78)')
    if (locked) p.insetRing(x, y, d, d, r, 1, 'rgba(148, 163, 184, 0.45)')
    else p.insetRing(x, y, d, d, r, d >= 64 ? 3 : 2, color)
    const image = this.images.get(src)
    if (src && image) {
      const g = glyph ?? d * 0.88
      ctx.save()
      if (locked) ctx.globalAlpha = 0.35
      p.image(image, x + (d - g) / 2, y + (d - g) / 2, g, g)
      ctx.restore()
    } else if (!src) {
      p.font(600, 12, this.family)
      this.line(fallback, x + d / 2, y + (d - 16) / 2, 12, 600, this.tokens['accent-ink'], {
        lineHeight: 16,
        align: 'center',
        alpha: locked ? 0.5 : 1,
      })
    }
    if (locked) {
      const size = Math.max(14, Math.round(d * 0.3))
      const bx = x + d + 2 - size
      const by = y + d + 2 - size
      p.fill(bx, by, size, size, size / 2, this.tokens['surface-raised'])
      iconPath(ctx, LOCK, bx + 3, by + 3, size - 6, {
        stroke: this.tokens['text-muted'],
        lineWidth: 2,
      })
    }
  }

  /** The game's item header art in a box: the rarity's gradient, the emblem over it. */
  protected itemArt(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    rarity: number | null,
    emblem: EmblemBox,
    emblemAlpha: number,
  ) {
    const { p, ctx } = this
    p.clipped(x, y, w, h, r, () => {
      const gradient = RARITY_GRADIENT[rarity ?? 0]
      ctx.fillStyle =
        (gradient && linearGradient(ctx, gradient, x, y, w, h)) || this.v('--card-cv-bg')
      ctx.fillRect(x, y, w, h)
      if (!qualityArt(rarity)) return
      p.image(this.images.get(qualityArt(rarity)), x, y, w, h)
      ctx.save()
      ctx.globalAlpha = emblemAlpha
      p.image(
        this.images.get(EMBLEM_URL),
        x + emblem.left,
        y + emblem.top,
        emblem.width,
        emblem.height,
      )
      ctx.restore()
    })
  }

  /** GameStars: gold stars with a darker edge, the row's drop shadow under them. */
  protected stars(count: number, x: number, y: number, size: number, gap: number, shadow: Shadow) {
    // Each star an <svg>, which Chrome puts on whole pixels.
    const boxes = Array.from({ length: count }, (_, i) =>
      this.p.snap(x + i * (size + gap), y, size, size),
    )
    const w = count * size + (count - 1) * gap
    this.p.layerShadow({ x, y, w, h: size }, shadow, (ctx) => {
      for (const [sx, sy, side] of boxes) {
        iconPath(ctx, STAR, sx, sy, side, {
          fill: this.tokens['game-star'],
          stroke: this.tokens['game-star-edge'],
          lineWidth: 0.8,
        })
      }
    })
  }

  /** ElementIcon's own glyph, in the element's colour (when the game's icon fails). */
  protected elementGlyph(element: Element, x: number, y: number, size: number) {
    const glyph = ELEMENT_GLYPHS[element]
    const color = this.elementColor(element)
    const ctx = this.ctx
    if (glyph.fill) {
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(size / 24, size / 24)
      ctx.fillStyle = color
      ctx.fill(new Path2D(glyph.fill), 'evenodd')
      ctx.restore()
    }
    if (glyph.stroke) {
      for (const angle of glyph.rotate ?? [0]) {
        ctx.save()
        ctx.translate(x + size / 2, y + size / 2)
        ctx.rotate((angle * Math.PI) / 180)
        ctx.translate(-size / 2, -size / 2)
        iconPath(ctx, glyph.stroke, 0, 0, size, { stroke: color, lineWidth: 2 })
        ctx.restore()
      }
    }
  }
}

/** `drop-shadow(0 18px 40px rgba(…))` as a shadow. */
export function parseFilterShadow(css: string): Shadow {
  const inner = /drop-shadow\((.*)\)\s*$/.exec(css)?.[1] ?? ''
  return parseShadows(inner)[0] ?? { x: 0, y: 0, blur: 0, color: 'transparent' }
}

/** CONSTELLATION_MAX_STYLE's background: the game's gold, top to bottom. */
export function goldChip(ctx: CanvasRenderingContext2D, y: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#fcde54')
  g.addColorStop(1, '#f0cc4e')
  return g
}

/** A colour (#rgb, #rrggbb, rgb(…)) at an alpha. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((h) => h + h).join('') : hex
    const n = parseInt(full, 16)
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  const rgb = /rgba?\(([^)]*)\)/
    .exec(color)?.[1]
    ?.split(/[\s,/]+/)
    .filter(Boolean)
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : color
}
