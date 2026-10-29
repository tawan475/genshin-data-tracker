/**
 * The character share card drawn straight onto a canvas, for its PNG: the
 * same 1920×1080 picture as ShareCard (which the page shows, with its
 * tooltips), from the same numbers (share-card-model) and palette
 * (share-card CARD_THEMES, the app's tokens under the card's theme). The
 * geometry below is ShareCard's layout worked out in px: a change to one is
 * a change to the other. See lib/card-canvas for why a canvas.
 */

import { bonusSets, buildRv, formatPanelValue, weaponLines } from '@/data/character-build'
import type { BuildPanel, DamageKind, TalentLevel } from '@/data/character-build'
import { SLOT_LABELS, type CharacterView } from '@/data/characters'
import type { Element } from '@/data/game-meta'
import { ELEMENT_GLYPHS } from '@/components/ui/element-glyphs'
import { t } from '@/i18n'
import {
  artifactIcon,
  artifactSetIcon,
  characterBanner,
  characterIcon,
  characterSplash,
  elementIcon,
  giCdnArt,
  weaponIcon,
} from '@/lib/assets'
import {
  CardImages,
  Painter,
  cardFonts,
  iconPath,
  linearGradient,
  parseInsetRing,
  parseShadows,
  themeTokens,
  type Shadow,
} from '@/lib/card-canvas'
import { cvTier, rvTier } from '@/lib/crit-tiers'
import { formatDate } from '@/lib/format'
import { levelCap } from '@/lib/level'
import { formatStatShort, formatStatValue } from '@/utils/artifact-stats'
import { LIGHT_ART } from './art-tone'
import { CONSTELLATION_MAX_STYLE, isMaxConstellation, refinementStyle } from './max-badges'
import { artTone } from './measure-art'
import {
  BAND_EMBLEM,
  BAND_ICON,
  BAND_ICON_RIGHT,
  BAND_WIDTH,
  CARD_HEIGHT,
  CARD_PAD_Y,
  CARD_THEMES,
  CARD_WIDTH,
  EMBLEM_URL,
  PIECE_GAP,
  PIECE_HEIGHT,
  RARITY_GRADIENT,
  SPLASH_BOX_SCALE,
  SPLASH_FULL,
  WEAPON_EMBLEM,
  WEAPON_TILE,
  chipBackground,
  elementGlow,
  nameSize,
  qualityArt,
  splashPlace,
  type CardOwner,
  type CardTheme,
  type EmblemBox,
} from './share-card'
import { cardPieces, ownerParts, type BandTone } from './share-card-model'
import { constellationIcons, talentIcons } from './talent-icons'

export interface CardDrawing {
  character: CharacterView
  panel: BuildPanel | null
  /** As the game shows them (C3/C5 boosts). */
  talents: readonly TalentLevel[]
  theme: CardTheme
  owner: CardOwner
  /** When the capture was taken (epoch ms). */
  takenAt: number | null
  /** The Crown of Insight's icon ('' while the planner data loads). */
  crown: string
  /** The bars under the level and friendship (share-card-model expShare). */
  levelBar: number | null
  friendshipBar: number | null
}

export interface DrawnCard {
  canvas: HTMLCanvasElement
  /** Images that couldn't be loaded (drawn without them). */
  missing: number
}

// ------------------------------------------------------------------ layout (ShareCard's, in px)

const PAD_X = 48
const TOP = CARD_PAD_Y
const BOTTOM = CARD_HEIGHT - CARD_PAD_Y
/** The three columns: who, weapon and stats, the pieces. */
const LEFT = { x: PAD_X, w: 700 }
const MIDDLE = { x: PAD_X + 700 + 32, w: 528 }
const RIGHT = { x: PAD_X + 700 + 32 + 528 + 32, w: 532 }
/** CSS's `line-height: 1.5` (the card's inherited line height). */
const LH = 1.5

const STAR =
  'M12 1.8l2.95 6.6 7.2.75-5.4 4.85 1.53 7.08L12 17.4l-6.28 3.68 1.53-7.08-5.4-4.85 7.2-.75z'
const LOCK =
  'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4'
const STAR_SHADOW: Shadow = { x: 0, y: 1, blur: 2, color: 'rgba(80,50,0,0.5)' }
const BAND_SHADE = 'rgba(30,16,4,0.5)'
const ROLL_TIER: Record<number, number> = { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1 }

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
type Tokens = Record<(typeof TOKENS)[number], string>

// ------------------------------------------------------------------ drawing

/** The card at `scale` device pixels per CSS pixel (1: the 1920×1080 PNG). */
export async function drawShareCard(input: CardDrawing, scale = 1): Promise<DrawnCard> {
  const c = input.character
  const pieces = cardPieces(c)
  const splashArt = SPLASH_FULL[c.key]
  const splashUrl = splashArt ? giCdnArt(`FullWish_${c.key}`) : characterSplash(c.key)
  const banner = characterBanner(c.key)
  const glyphs = talentIcons(c.key)
  const constellations = constellationIcons(c.key)
  const element = c.element ? elementIcon(c.element) : ''
  const urls = [
    banner,
    splashUrl,
    element,
    input.crown,
    EMBLEM_URL,
    ...constellations,
    glyphs.auto,
    glyphs.skill,
    glyphs.burst,
    ...(c.weapon
      ? [qualityArt(c.weapon.rarity), weaponIcon(c.weapon.key, c.weapon.ascension)]
      : []),
    ...pieces.flatMap(({ piece }) =>
      piece ? [qualityArt(piece.rarity), artifactIcon(piece.setKey, piece.slotKey)] : [],
    ),
    ...bonusSets(c.sets).map(({ set }) => artifactSetIcon(set.setKey)),
    ...(input.panel?.rows.flatMap((row) =>
      row.damage && row.damage !== 'physical' ? [elementIcon(row.damage)] : [],
    ) ?? []),
  ]
  const [images, fonts, tone] = await Promise.all([
    CardImages.load(urls),
    cardFonts([400, 500, 600, 700]),
    banner ? artTone(banner) : Promise.resolve(LIGHT_ART),
  ])
  // The splash failed: the portrait shows in its place (SplashArt).
  const portraitImages = images.get(splashUrl)
    ? null
    : await CardImages.load([characterIcon(c.key), qualityArt(c.rarity)])

  const p = new Painter(CARD_WIDTH, CARD_HEIGHT, scale)
  try {
    const card = new CardPainter(p, input, images, fonts.tabular, tone.top)
    card.background(splashUrl, portraitImages)
    card.layout()
    card.header()
    card.constellations(constellations)
    card.foot(glyphs)
    card.weapon()
    card.stats()
    card.sets()
    pieces.forEach((piece, index) => card.piece(piece, index))
    return { canvas: p.canvas, missing: images.missing + (portraitImages?.missing ?? 0) }
  } finally {
    p.done()
    images.close()
    portraitImages?.close()
  }
}

class CardPainter {
  private readonly ctx: CanvasRenderingContext2D
  private readonly theme: Record<string, string>
  private readonly tokens: Tokens
  private readonly c: CharacterView
  /** The card painted up to its panels, for their backdrop blur. */
  private backdropCopy: HTMLCanvasElement | null = null
  /** Where the left column's foot (talents) and the sets panel start, set by `layout`. */
  private footTop = 0
  private setsTop = 0
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(
    private readonly p: Painter,
    private readonly input: CardDrawing,
    private readonly images: CardImages,
    private readonly family: string,
    /** The header's region of the namecard is dark (art-tone): a light card writes it white. */
    private readonly darkHeader: boolean,
  ) {
    this.ctx = p.ctx
    this.c = input.character
    this.theme = { ...CARD_THEMES[input.theme] }
    const chip = chipBackground(this.c.key, input.theme)
    if (chip) this.theme['--card-chip'] = chip
    this.tokens = themeTokens(input.theme, TOKENS)
  }

  private v(name: string): string {
    return this.theme[name] ?? ''
  }

  private elementColor(element: Element | null): string {
    return element ? this.tokens[`element-${element}`] : this.tokens['text-muted']
  }

  private damageColor(kind: DamageKind): string {
    return this.tokens[`element-${kind}`]
  }

  /** Text in the card's tabular Outfit: `weight size`, the line box's top and height. */
  private line(
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

  private textWidth(text: string, size: number, weight: number): number {
    this.p.font(weight, size, this.family)
    return this.p.measure(text)
  }

  /** The tier colour of a CV / RV, and the reduced-motion glow of the top tier (cv-glow). */
  private tier(tier: number): { color: string; shadows?: Shadow[] } {
    const color = this.tokens[`cv-${tier}` as keyof Tokens]
    return tier === 6 && this.reducedMotion
      ? { color, shadows: [{ x: 0, y: 0, blur: 2, color }] }
      : { color }
  }

  private glow(tone: BandTone | null, color: string): Shadow[] | undefined {
    return tone?.top && this.reducedMotion ? [{ x: 0, y: 0, blur: 2, color }] : undefined
  }

  // -------------------------------------------------- background

  background(splashUrl: string, portrait: CardImages | null) {
    const { p, ctx } = this
    ctx.fillStyle = this.v('--card-ground')
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

    // The namecard, oversized and blurred into atmosphere.
    const namecard = this.images.get(characterBanner(this.c.key))
    if (namecard) {
      const filter = /blur\(([\d.]+)px\) saturate\(([\d.]+)\) brightness\(([\d.]+)\)/.exec(
        this.v('--card-namecard-filter'),
      )
      p.filtered(
        {
          blur: Number(filter?.[1] ?? 10),
          saturate: Number(filter?.[2] ?? 1),
          brightness: Number(filter?.[3] ?? 1),
        },
        () => p.cover(namecard, -60, -40, 2040, 1160),
      )
    }
    this.cssGradients(this.v('--card-scrim'))
    if (this.c.element) this.drawGlow(this.c.element)

    // The splash (the uncut art where the game's is cut), with its shadow.
    const place = splashPlace(this.c.key)
    const splash = this.images.get(splashUrl)
    const shadow = parseFilterShadow(this.v('--card-splash-shadow'))
    if (splash) {
      const full = SPLASH_FULL[this.c.key]
      const draw = () => {
        if (full) {
          const k = SPLASH_BOX_SCALE
          p.image(
            splash,
            place.left + full.x * k,
            place.top + full.y * k,
            full.width * full.scale * k,
            full.height * full.scale * k,
          )
        } else p.contain(splash, place.left, place.top, 2200, 1100)
      }
      if (full) p.dropShadow(shadow, draw)
      else p.clipped(place.left, place.top, 2200, 1100, 0, () => p.dropShadow(shadow, draw))
    } else if (portrait) {
      // SplashArt's fallback: the portrait on its rarity cell, centred in the box.
      const x = place.left + 1100 - 64
      const y = place.top + 550 - 64
      p.clipped(x, y, 128, 128, 16, () => {
        const gradient = RARITY_GRADIENT[this.c.rarity ?? 0]
        const fill = gradient && linearGradient(ctx, gradient, x, y, 128, 128)
        if (fill) p.fill(x, y, 128, 128, 0, fill)
        p.image(portrait.get(qualityArt(this.c.rarity)), x, y, 128, 128)
        p.image(portrait.get(characterIcon(this.c.key)), x, y, 128, 128)
      })
    }
    this.cssGradients(this.v('--card-vignette'))
    this.backdropCopy = p.snapshot()
  }

  /** CSS `linear-gradient(…)` layers over the whole card (scrim, vignette), the last first. */
  private cssGradients(css: string) {
    const layers = css.split(/,\s*(?=linear-gradient)/).reverse()
    for (const layer of layers) {
      const fill = linearGradient(this.ctx, layer, 0, 0, CARD_WIDTH, CARD_HEIGHT)
      if (!fill) continue
      this.ctx.fillStyle = fill
      this.ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
    }
  }

  /** share-card elementGlow: an ellipse 620×760 at (340, 560), 0 / 45% / 75%. */
  private drawGlow(element: Element) {
    const ctx = this.ctx
    // The glow's colour and strength come from share-card (one source).
    const m = /rgba\((\d+,\d+,\d+),([\d.]+)\)/.exec(elementGlow(element, this.input.theme))
    if (!m) return
    const [rgb, core] = [m[1]!, Number(m[2])]
    ctx.save()
    ctx.translate(340, 560)
    ctx.scale(1, 760 / 620)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 620)
    g.addColorStop(0, `rgba(${rgb},${core})`)
    g.addColorStop(0.45, `rgba(${rgb},0.1)`)
    g.addColorStop(0.75, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.fillRect(-340, -560 * (620 / 760), CARD_WIDTH, CARD_HEIGHT * (620 / 760))
    ctx.restore()
  }

  // -------------------------------------------------- glass

  /** A panel: its shadow, the art blurred behind it, its fill and hairline. */
  private glass(x: number, y: number, w: number, h: number, r: number, kind: 'panel' | 'chip') {
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

  /** Sizes what the columns' feet hold: the talents and owner box, the sets panel. */
  layout() {
    // Left column foot: talents (112 disc + 10 + 40 pill), 22, the owner box.
    const owner = ownerParts(this.input.owner)
    const ownerH = 10 + (owner.length ? 33 + 2 : 0) + 24 + 10
    this.footTop = BOTTOM - (162 + 22 + ownerH)
    // Sets panel: 18 + rows + 18.
    const bonus = bonusSets(this.c.sets)
    const rowsH = bonus.length * 44 + Math.max(0, bonus.length - 1) * 12
    const lastH = this.c.artifactCount ? (bonus.length ? 11 : 0) + 30 : 33
    const setsH = 18 + rowsH + (bonus.length ? 12 : 0) + lastH + 18
    this.setsTop = BOTTOM - setsH
  }

  // -------------------------------------------------- left column

  header() {
    const { p, c } = this
    const size = nameSize(c.name)
    const rowH = Math.max(c.element ? 60 : 0, size, 41)
    const top = TOP
    let x = LEFT.x

    // Element icon (the game's, else our glyph), with its shadow.
    if (c.element) {
      const icon = this.images.get(elementIcon(c.element))
      const iy = top + (rowH - 60) / 2
      p.dropShadow({ x: 0, y: 2, blur: 6, color: 'rgba(0,0,0,0.45)' }, () => {
        if (icon) p.contain(icon, x, iy, 60, 60)
        else this.elementGlyph(c.element!, x, iy, 60)
      })
      x += 60 + 18
    }

    // The C chip's width first: the name gives way to it.
    const chipText = `C${c.constellation}`
    const chipW = this.textWidth(chipText, 22, 700) + 24
    const hero = this.darkHeader && this.input.theme === 'light' ? CARD_THEMES.dark : this.theme
    let nameW = 0
    p.letterSpaced(-0.5, () => {
      p.font(700, size, this.family)
      const nameMax = LEFT.x + LEFT.w - x - 18 - 6 - chipW
      const name = p.ellipsize(c.name, nameMax)
      nameW = p.measure(name)
      // The h1 cuts its glow at its box (truncate: overflow hidden), with room
      // above and below the line for accents and descenders (Xiangling's g).
      const nameTop = top + (rowH - size) / 2
      const room = Math.round(size * 0.3)
      p.clipped(x, nameTop - room, nameW, size + 2 * room, 0, () =>
        p.text(name, x, p.baseline(nameTop, size), hero['--card-hero']!, {
          shadows: parseShadows(hero['--card-hero-shadow']!),
        }),
      )
    })
    x += nameW + 18 + 6
    const chipTop = top + (rowH - 41) / 2
    if (isMaxConstellation(c.constellation)) {
      p.boxShadow(x, chipTop, chipW, 41, 20.5, { x: 0, y: 1, blur: 4, color: 'rgba(80,50,0,0.45)' })
      p.fill(x, chipTop, chipW, 41, 20.5, goldChip(this.ctx, chipTop, 41))
      this.line(chipText, x + 12, chipTop + 4, 22, 700, CONSTELLATION_MAX_STYLE.color)
    } else {
      p.fill(x, chipTop, chipW, 41, 20.5, this.v('--card-chip'))
      const ring = parseInsetRing(this.v('--card-chip-ring'))
      if (ring) p.insetRing(x, chipTop, chipW, 41, 20.5, ring.width, ring.color)
      this.line(chipText, x + 12, chipTop + 4, 22, 700, this.v('--card-hero'))
    }

    // Level and friendship on a backing, with their EXP bars (the name's glow behind it too).
    this.backdropCopy = p.snapshot()
    const boxTop = top + rowH + 10
    // Both bars always show (an unknown share is an empty bar): a card without
    // them looked broken next to one with (the user, 2026-10-30). The text on a
    // 32 px line, its bar 2 px under it, even padding (the user's spacing).
    const boxH = 60
    const parts = this.levelParts()
    const boxW = 18 + parts.width + 18
    this.glass(LEFT.x, boxTop, boxW, boxH, 20, 'chip')
    const color = this.v('--card-hero')
    const lineH = 32
    const lineTop = boxTop + 10
    for (const part of parts.runs) {
      this.line(part.text, LEFT.x + 18 + part.x, lineTop, 28, part.weight, color, {
        alpha: part.alpha,
        lineHeight: lineH,
      })
    }
    for (const bar of parts.bars) {
      const bx = LEFT.x + 18 + bar.x
      const by = lineTop + lineH + 2
      p.fill(bx, by, bar.w, 6, 3, withAlpha(color, 0.2))
      p.clipped(bx, by, bar.w, 6, 3, () =>
        p.fill(bx, by, (bar.w * bar.share) / 100, 6, 3, bar.color),
      )
    }

    // Stars.
    if (c.rarity) this.stars(c.rarity, LEFT.x + 2, boxTop + boxH + 10, 34, 6, STAR_SHADOW)
  }

  /**
   * "Lv. 90/90 · Friendship 10": runs of text and their bars, x from the box's
   * padding. Both halves are as wide as the widest either can be ("Lv.
   * 100/100", "Friendship 10"), so the box and both bars keep one length
   * whatever the numbers (the user's call; ShareCard's grid does the same).
   */
  private levelParts() {
    const c = this.c
    const runs: { text: string; x: number; weight: number; alpha?: number }[] = []
    const bars: { x: number; w: number; share: number; color: string }[] = []
    const cap = levelCap(c.ascension, c.level)
    const level = [
      { text: 'Lv. ', weight: 400, alpha: 0.85 },
      { text: String(c.level), weight: 700 },
      { text: `/${cap}`, weight: 500, alpha: 0.7 },
    ]
    const friendship =
      c.friendship === null
        ? null
        : [
            { text: `${t('game.friendship')} `, weight: 400, alpha: 0.85 },
            { text: String(c.friendship), weight: 700 },
          ]
    const widthOf = (parts: typeof level) =>
      parts.reduce((sum, part) => sum + this.textWidth(part.text, 28, part.weight), 0)
    const widest = [
      { text: 'Lv. ', weight: 400 },
      { text: '100', weight: 700 },
      { text: '/100', weight: 500 },
    ]
    const widestFriendship = [
      { text: `${t('game.friendship')} `, weight: 400 },
      { text: '10', weight: 700 },
    ]
    const slot = Math.max(
      widthOf(level),
      widthOf(widest),
      friendship ? Math.max(widthOf(friendship), widthOf(widestFriendship)) : 0,
    )
    const place = (parts: typeof level, from: number) => {
      let x = from
      for (const part of parts) {
        runs.push({ ...part, x })
        x += this.textWidth(part.text, 28, part.weight)
      }
    }
    place(level, 0)
    bars.push({ x: 0, w: slot, share: this.input.levelBar ?? 0, color: '#818cf8' })
    let x = slot
    if (friendship) {
      x += 22
      runs.push({ text: '·', x, weight: 400, alpha: 0.5 })
      x += this.textWidth('·', 28, 400) + 22
      place(friendship, x)
      bars.push({ x, w: slot, share: this.input.friendshipBar ?? 0, color: '#f472b6' })
      x += slot
    }
    return { runs, bars, width: x }
  }

  constellations(icons: readonly string[]) {
    icons.forEach((src, index) => {
      const x = LEFT.x + LEFT.w - 84
      const y = TOP + 150 + index * (84 + 16)
      this.disc(x, y, 84, src, null, index >= this.c.constellation, `C${index + 1}`)
    })
  }

  /** ElementDisc: a glyph on the dark disc, the element's ring and glow; `locked` dims it. */
  private disc(
    x: number,
    y: number,
    d: number,
    src: string,
    glyph: number | null,
    locked: boolean,
    fallback: string,
  ) {
    const { p, ctx } = this
    const color = this.elementColor(this.c.element)
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

  foot(glyphs: { auto: string; skill: string; burst: string }) {
    const { p } = this
    const top = this.footTop
    let x = LEFT.x
    for (const talent of this.input.talents) {
      const crown = talent.crowned && this.images.get(this.input.crown)
      const levelText = String(talent.level)
      const textW = this.textWidth(levelText, 26, 700)
      const pillW = 14 + (crown ? 30 : 0) + textW + 14
      const liW = Math.max(112, pillW)
      this.disc(x + (liW - 112) / 2, top, 112, glyphs[talent.key], 90, false, '')
      const px = x + (liW - pillW) / 2
      const py = top + 112 + 10
      p.fill(px, py, pillW, 40, 20, this.v('--card-pill'))
      if (talent.crowned) p.insetRing(px, py, pillW, 40, 20, 2, this.tokens['talent-crown'])
      let tx = px + 14
      if (crown) {
        p.image(crown, px + 8, py + 5, 30, 30)
        tx = px + 8 + 30 + 6
      }
      const color = talent.crowned
        ? this.tokens['talent-crown']
        : talent.from
          ? this.tokens['talent-boost']
          : this.v('--card-text')
      this.line(levelText, tx, py + 0.5, 26, 700, color)
      x += liW + 30
    }

    // The owner, the capture date and the site.
    const owner = ownerParts(this.input.owner)
    const date = this.input.takenAt ? formatDate(this.input.takenAt) : null
    const boxTop = top + 162 + 22
    const dotW = this.textWidth('·', 22, 400)
    const ownerW = owner.reduce(
      (sum, part, i) =>
        sum +
        this.textWidth(part, 22, i === 0 && this.input.owner.name ? 600 : 400) +
        (i ? 24 + dotW : 0),
      0,
    )
    const dateParts = [...(date ? [date, '·'] : []), 'teyvat.me']
    const dateW =
      dateParts.reduce((sum, part) => sum + this.textWidth(part, 16, 400), 0) +
      10 * (dateParts.length - 1)
    const boxH = 10 + (owner.length ? 35 : 0) + 24 + 10
    this.glass(LEFT.x, boxTop, 36 + Math.max(ownerW, dateW), boxH, 18, 'chip')
    const color = this.v('--card-hero')
    let ox = LEFT.x + 18
    owner.forEach((part, i) => {
      if (i) {
        ox += 12
        ox += this.line('·', ox, boxTop + 10, 22, 400, color, { alpha: 0.6 })
        ox += 12
      }
      ox += this.line(
        part,
        ox,
        boxTop + 10,
        22,
        i === 0 && this.input.owner.name ? 600 : 400,
        color,
      )
    })
    let dx = LEFT.x + 18
    const dateTop = boxTop + 10 + (owner.length ? 35 : 0)
    dateParts.forEach((part, i) => {
      if (i) dx += 10
      dx += this.line(part, dx, dateTop, 16, 400, color, { alpha: part === '·' ? 0.8 * 0.6 : 0.8 })
    })
  }

  // -------------------------------------------------- middle column

  weapon() {
    const { p, c } = this
    const x = MIDDLE.x
    if (!c.weapon) {
      this.glass(x, TOP, MIDDLE.w, 164, 22, 'panel')
      this.line(
        t('characters.gap.noWeapon'),
        x + MIDDLE.w / 2,
        TOP + (164 - 36) / 2,
        24,
        400,
        this.v('--card-muted'),
        {
          align: 'center',
        },
      )
      return
    }
    const weapon = c.weapon
    const lines = weaponLines(weapon)
    const colH = 33 + 8 + 37 + (lines ? 8 + 36 : 0)
    const h = 18 + Math.max(WEAPON_TILE, colH) + 18
    this.glass(x, TOP, MIDDLE.w, h, 22, 'panel')

    // The tile: the rarity's header art, the emblem at 48%, the icon.
    const tx = x + 22
    const ty = TOP + (h - WEAPON_TILE) / 2
    this.itemArt(tx, ty, WEAPON_TILE, WEAPON_TILE, 16, weapon.rarity, WEAPON_EMBLEM, 0.48)
    p.clipped(tx, ty, WEAPON_TILE, WEAPON_TILE, 16, () =>
      p.image(this.images.get(weaponIcon(weapon.key, weapon.ascension)), tx, ty, 128, 128),
    )

    const cx = tx + WEAPON_TILE + 20
    const maxW = x + MIDDLE.w - 22 - cx
    let y = TOP + (h - colH) / 2
    this.line(weapon.name, cx, y, 30, 600, this.v('--card-text'), { lineHeight: 33, max: maxW })
    y += 33 + 8
    const muted = this.v('--card-muted')
    const text = this.v('--card-text')
    let lx = cx
    lx += this.line('Lv. ', lx, y + 2, 22, 400, muted)
    lx += this.line(String(weapon.level), lx, y + 2, 22, 600, text)
    lx += this.line(`/${levelCap(weapon.ascension, weapon.level)}`, lx, y + 2, 22, 400, muted)
    lx += 12
    const refine = refinementStyle(weapon.refinement)
    const rText = `R${weapon.refinement}`
    const rW = this.textWidth(rText, 22, 700) + 20
    p.fill(lx, y, rW, 37, 8, refine.background)
    this.line(rText, lx + 10, y + 2, 22, 700, refine.color)
    lx += rW + 12
    if (weapon.rarity) this.stars(weapon.rarity, lx, y + 7.5, 22, 4, STAR_SHADOW)
    y += 37 + 8
    if (lines) {
      let sx = cx
      for (const stat of [lines.atk, lines.sub]) {
        if (!stat) continue
        sx += this.line(
          `${formatStatShort(stat.key === 'baseAtk' ? 'atk' : stat.key)} `,
          sx,
          y,
          24,
          400,
          muted,
        )
        sx += this.line(stat.text, sx, y, 24, 700, text) + 22
      }
    }
  }

  stats() {
    const { p, c } = this
    const panel = this.input.panel
    const x = MIDDLE.x
    const top = TOP + (c.weapon ? this.weaponHeight() : 164) + 16
    const h = this.setsTop - 16 - top
    this.glass(x, top, MIDDLE.w, h, 22, 'panel')
    if (!panel) {
      this.line(
        t('characters.stats.none'),
        x + MIDDLE.w / 2,
        top + (h - 36) / 2,
        24,
        400,
        this.v('--card-muted'),
        {
          align: 'center',
        },
      )
      return
    }
    const rows = panel.rows
    const inner = h - 20
    const share = (inner - (rows.length - 1)) / rows.length
    const left = x + 26
    const right = x + MIDDLE.w - 26
    let y = top + 10
    rows.forEach((row, index) => {
      const mid = y + share / 2
      const color = row.damage ? this.damageColor(row.damage) : null
      // The value, right-aligned in at least 110px.
      const valueW = Math.max(110, this.textWidth(row.text, 30, 700))
      this.line(row.text, right, mid - 22.5, 30, 700, color ?? this.v('--card-text'), {
        align: 'right',
      })
      let labelMax = right - valueW - 12 - left
      // The white base and the green bonus (HP, ATK, DEF).
      if (row.base !== undefined && row.bonus) {
        const base = `${formatPanelValue(row.key, row.base)} `
        const bonus = `+${formatPanelValue(row.key, row.bonus)}`
        const bonusW = this.textWidth(bonus, 23, 600)
        const baseW = this.textWidth(base, 23, 500)
        const end = right - valueW - 12
        this.line(base, end - bonusW - baseW, mid - 17.25, 23, 500, this.v('--card-secondary'))
        this.line(bonus, end - bonusW, mid - 17.25, 23, 600, this.v('--card-bonus'))
        labelMax -= baseW + bonusW + 12
      }
      let lx = left
      if (row.damage && row.damage !== 'physical') {
        const icon = this.images.get(elementIcon(row.damage))
        if (icon) p.contain(icon, lx, mid - 13, 26, 26)
        else this.elementGlyph(row.damage, lx, mid - 13, 26)
        lx += 26 + 10
        labelMax -= 36
      }
      this.line(row.label, lx, mid - 18.75, 25, 400, color ?? this.v('--card-secondary'), {
        max: labelMax,
      })
      if (index < rows.length - 1) {
        this.ctx.fillStyle = this.v('--card-rule')
        this.ctx.fillRect(left, y + share, right - left, 1)
        y += 1
      }
      y += share
    })
  }

  private weaponHeight(): number {
    const lines = this.c.weapon ? weaponLines(this.c.weapon) : null
    return 18 + Math.max(WEAPON_TILE, 33 + 8 + 37 + (lines ? 8 + 36 : 0)) + 18
  }

  sets() {
    const { p, c } = this
    const x = MIDDLE.x
    const top = this.setsTop
    const bonus = bonusSets(c.sets)
    this.glass(x, top, MIDDLE.w, BOTTOM - top, 22, 'panel')
    const left = x + 24
    const right = x + MIDDLE.w - 24
    let y = top + 18
    for (const { set, pieces } of bonus) {
      p.image(this.images.get(artifactSetIcon(set.setKey)), left, y, 44, 44)
      const count = String(pieces)
      const chipW = Math.max(36, this.textWidth(count, 22, 700) + 20)
      p.fill(right - chipW, y + 3.5, chipW, 37, 10, this.v('--card-set-on-bg'))
      this.line(count, right - chipW / 2, y + 5.5, 22, 700, this.v('--card-set-on'), {
        align: 'center',
      })
      const nameX = left + 44 + 14
      this.line(set.name, nameX, y + (44 - 34.5) / 2, 23, 400, this.v('--card-text'), {
        max: right - chipW - 14 - nameX,
      })
      y += 44 + 12
    }
    const muted = this.v('--card-muted')
    if (!c.artifactCount) {
      this.line(t('characters.detail.noArtifacts'), left, y, 22, 400, muted)
      return
    }
    if (bonus.length) {
      this.ctx.fillStyle = this.v('--card-rule')
      this.ctx.fillRect(left, y, right - left, 1)
      y += 11
    }
    this.line(t('characters.detail.build'), left, y, 20, 400, muted)
    const rv = buildRv(c.artifacts)
    const cvText = c.cv.toFixed(1)
    const rvTone = rv > 0 ? this.tier(rvTier(rv, 'build')) : { color: this.v('--card-text') }
    const cvTone = c.cv > 0 ? this.tier(cvTier(c.cv, 'build')) : { color: this.v('--card-text') }
    let rx = right - this.textWidth(cvText, 20, 700)
    this.line(cvText, rx, y, 20, 700, cvTone.color, { shadows: cvTone.shadows })
    rx -= this.textWidth('CV ', 20, 400)
    this.line('CV ', rx, y, 20, 400, muted)
    rx -= 18 + this.textWidth(`${rv}%`, 20, 700)
    this.line(`${rv}%`, rx, y, 20, 700, rvTone.color, { shadows: rvTone.shadows })
    rx -= this.textWidth('RV ', 20, 400)
    this.line('RV ', rx, y, 20, 400, muted)
  }

  // -------------------------------------------------- right column

  piece(slot: ReturnType<typeof cardPieces>[number], index: number) {
    const { p } = this
    const x = RIGHT.x
    const w = RIGHT.w
    const top = TOP + index * (PIECE_HEIGHT + PIECE_GAP)
    const h = PIECE_HEIGHT
    this.glass(x, top, w, h, 22, 'panel')
    const piece = slot.piece
    if (!piece) {
      this.line(
        SLOT_LABELS[slot.slot],
        x + w / 2,
        top + (h - 36) / 2,
        24,
        400,
        this.v('--card-muted'),
        {
          align: 'center',
        },
      )
      return
    }

    // The band: header art, the emblem at 70%, a shade, the icon and the level.
    p.clipped(x, top, w, h, 22, () => {
      this.itemArt(x, top, BAND_WIDTH, h, 0, piece.rarity, BAND_EMBLEM, 0.7)
      const shade = this.ctx.createLinearGradient(x, 0, x + BAND_WIDTH, 0)
      shade.addColorStop(0, 'rgba(40,20,8,0.22)')
      shade.addColorStop(0.5, 'rgba(40,20,8,0)')
      this.ctx.fillStyle = shade
      this.ctx.fillRect(x, top, BAND_WIDTH, h)
      const icon = this.images.get(artifactIcon(piece.setKey, piece.slotKey))
      p.dropShadow({ x: 0, y: 4, blur: 10, color: 'rgba(70,36,6,0.35)' }, () =>
        p.image(
          icon,
          x + BAND_WIDTH - BAND_ICON_RIGHT - BAND_ICON,
          top + (h - BAND_ICON) / 2,
          BAND_ICON,
          BAND_ICON,
        ),
      )
      const level = `+${piece.level}`
      const levelW = this.textWidth(level, 17, 700) + 16
      const lx = x + BAND_WIDTH - 10 - levelW
      const ly = top + h - 10 - 27.5
      p.fill(lx, ly, levelW, 27.5, 8, 'rgba(30,16,4,0.55)')
      this.line(level, lx + 8, ly + 1, 17, 700, '#ffffff')

      // Main stat, its value, stars, CV and RV.
      const tx = x + 18
      let ty = top + 12 + (h - 24 - 152.9) / 2
      this.line(formatStatShort(piece.mainStatKey), tx, ty, 18, 500, 'rgba(255,248,235,0.95)', {
        shadows: [{ x: 0, y: 1, blur: 2, color: 'rgba(70,36,6,0.6)' }],
      })
      ty += 27 + 3
      const value =
        piece.mainStatValue === null ? '—' : formatStatValue(piece.mainStatKey, piece.mainStatValue)
      this.line(value, tx, ty, 38, 700, '#ffffff', {
        lineHeight: 39.9,
        shadows: [{ x: 0, y: 1, blur: 3, color: 'rgba(70,36,6,0.6)' }],
      })
      ty += 39.9 + 3
      this.stars(piece.rarity, tx, ty + 2, 15, 1, {
        x: 0,
        y: 1,
        blur: 1,
        color: 'rgba(70,36,6,0.5)',
      })
      ty += 21 + 3
      for (const [label, tone] of [
        [`CV ${piece.cv.toFixed(1)}`, slot.cv],
        [`RV ${piece.rv}%`, slot.rv],
      ] as const) {
        const pillW = this.textWidth(label, 16, 600) + 14
        p.fill(tx, ty, pillW, 26, 6, BAND_SHADE)
        this.line(label, tx + 7, ty + 1, 16, 600, tone?.color ?? '#ffffff', {
          shadows: this.glow(tone, tone?.color ?? '#ffffff'),
        })
        ty += 26 + 4
      }
    })

    // Four substat lines: name, value, roll bars.
    const left = x + BAND_WIDTH + 18
    const right = x + w - 12
    const free = (h - 16 - 4 * 28) / 4
    for (let n = 0; n < 4; n++) {
      const line = slot.lines[n]
      if (!line) continue
      const y = top + 8 + free / 2 + n * (28 + free)
      this.ctx.save()
      if (line.inactive) this.ctx.globalAlpha = 0.45
      const barsX = right - 57
      const value = formatStatValue(line.key, line.value)
      const valueW = this.textWidth(value, 21, 600)
      this.line(value, barsX - 8, y + (28 - 31.5) / 2, 21, 600, this.v('--card-text'), {
        align: 'right',
      })
      this.line(
        formatStatShort(line.key),
        left,
        y + (28 - 28.5) / 2,
        19,
        400,
        this.v('--card-secondary'),
        {
          max: barsX - 8 - valueW - 8 - left,
        },
      )
      if (!line.inactive) {
        line.rolls.forEach((roll, k) => {
          const bh = Math.round(24 * ROLL_TIER[roll.quality]!)
          p.fill(barsX + k * 10, y + 2 + 24 - bh, 7, bh, 2, this.v(`--card-roll-${roll.quality}`))
        })
      }
      this.ctx.restore()
    }
  }

  // -------------------------------------------------- shared bits

  /** The game's item header art in a box: the rarity's gradient, the emblem over it. */
  private itemArt(
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
  private stars(count: number, x: number, y: number, size: number, gap: number, shadow: Shadow) {
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
  private elementGlyph(element: Element, x: number, y: number, size: number) {
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

// ------------------------------------------------------------------ helpers

/** `drop-shadow(0 18px 40px rgba(…))` as a shadow. */
function parseFilterShadow(css: string): Shadow {
  const inner = /drop-shadow\((.*)\)\s*$/.exec(css)?.[1] ?? ''
  return parseShadows(inner)[0] ?? { x: 0, y: 0, blur: 0, color: 'transparent' }
}

/** CONSTELLATION_MAX_STYLE's background: the game's gold, top to bottom. */
function goldChip(ctx: CanvasRenderingContext2D, y: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#fcde54')
  g.addColorStop(1, '#f0cc4e')
  return g
}

/** A colour (#rgb, #rrggbb, rgb(…)) at an alpha. */
function withAlpha(color: string, alpha: number): string {
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
