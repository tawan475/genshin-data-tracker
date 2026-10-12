/**
 * Made-up wish histories for tests, size measurements and screenshots: real
 * item names, invented results. Ids follow the game's shape (the pull's UTC
 * minute in seconds, times 10^9, plus a counter that steps by one within a
 * ten-pull), times the server's clock. Deterministic per seed.
 *
 * Self-contained (only type imports), so a plain Node script can run it.
 */

import type { WishRecord } from '../src/wish/records'

export interface SyntheticOptions {
  seed?: number
  /** Pulls per banner type, e.g. { 301: 3000, 302: 800, 200: 1000, 100: 20, 500: 180 }. */
  pulls: Partial<Record<'100' | '200' | '301' | '302' | '500', number>>
  /** First pull, wall-clock seconds (the server's clock). */
  start?: number
  /** Hours from UTC of that clock. */
  timezone?: number
  uid?: string
  /** Featured items at a time (wall clock), for the event banners; else a fixed list. */
  featured?: (
    banner: '301' | '302' | '500',
    time: number,
  ) => { five: string[]; four: string[] } | null
  /** Whether a name is a weapon (default: the built-in lists). */
  isWeapon?: (name: string) => boolean
}

const STANDARD_FIVE = ['Diluc', 'Jean', 'Keqing', 'Mona', 'Qiqi', 'Tighnari', 'Dehya']
const STANDARD_FIVE_WEAPONS = [
  "Amos' Bow",
  'Skyward Harp',
  'Lost Prayer to the Sacred Winds',
  'Skyward Atlas',
  'Primordial Jade Winged-Spear',
  'Skyward Spine',
  "Wolf's Gravestone",
  'Skyward Pride',
  'Skyward Blade',
  'Aquila Favonia',
]
const FOUR_CHARACTERS = [
  'Bennett',
  'Xingqiu',
  'Xiangling',
  'Fischl',
  'Sucrose',
  'Diona',
  'Chongyun',
  'Noelle',
  'Barbara',
  'Beidou',
  'Ningguang',
  'Razor',
  'Faruzan',
  'Layla',
  'Kuki Shinobu',
  'Yun Jin',
]
const FOUR_WEAPONS = [
  'The Flute',
  'Sacrificial Sword',
  'Favonius Sword',
  "Lion's Roar",
  'Rainslasher',
  'Favonius Greatsword',
  'Sacrificial Greatsword',
  "Dragon's Bane",
  'Favonius Lance',
  'Favonius Codex',
  'Sacrificial Fragments',
  'The Widsith',
  'Eye of Perception',
  'The Stringless',
  'Favonius Warbow',
  'Sacrificial Bow',
  'Rust',
]
const THREE_WEAPONS = [
  'Cool Steel',
  'Harbinger of Dawn',
  'Skyrider Sword',
  'Debate Club',
  'Ferrous Shadow',
  'Bloodtainted Greatsword',
  'Black Tassel',
  'Magic Guide',
  'Thrilling Tales of Dragon Slayers',
  'Emerald Orb',
  'Raven Bow',
  "Sharpshooter's Oath",
  'Slingshot',
]
const EVENT_FIVE = ['Furina', 'Neuvillette', 'Nahida', 'Raiden Shogun', 'Hu Tao', 'Yelan']
const EVENT_WEAPONS = [
  'Splendor of Tranquil Waters',
  'Tome of the Eternal Flow',
  'A Thousand Floating Dreams',
]
const WEAPON_NAMES = new Set([
  ...STANDARD_FIVE_WEAPONS,
  ...FOUR_WEAPONS,
  ...THREE_WEAPONS,
  ...EVENT_WEAPONS,
])

function random(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 2 ** 32
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
function wallClock(seconds: number): string {
  const d = new Date(seconds * 1000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/** Records per banner type, newest first (as the API lists them). */
export function syntheticWishRecords(options: SyntheticOptions): WishRecord[] {
  const rand = random(options.seed ?? 7)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  const tz = options.timezone ?? 8
  const isWeapon = options.isWeapon ?? ((name: string) => WEAPON_NAMES.has(name))
  const out: WishRecord[] = []
  let counter = 1_000_000 + Math.floor(rand() * 2_000_000)
  for (const [banner, total] of Object.entries(options.pulls) as [
    '100' | '200' | '301' | '302' | '500',
    number,
  ][]) {
    let time = options.start ?? Date.UTC(2025, 0, 2, 12) / 1000
    let pity5 = 0
    let pity4 = 0
    let guaranteed: boolean = false
    const records: WishRecord[] = []
    while (records.length < total) {
      // A session: one pull or ten, minutes to days after the last.
      time += Math.floor(60 + rand() * (rand() < 0.3 ? 3 * 86400 : 4 * 3600))
      const ten = total - records.length >= 10 && rand() < 0.7
      const size = ten ? 10 : 1
      const minute = Math.floor((time - tz * 3600) / 60) * 60
      counter += 1 + Math.floor(rand() * 400_000)
      const second = banner === '301' && rand() < 0.3 ? '400' : banner
      for (let k = 0; k < size; k++) {
        pity5++
        pity4++
        const soft = pity5 >= 74 ? 0.006 + (pity5 - 73) * 0.06 : 0.006
        let name: string
        let rank: number
        const featured =
          banner === '301' || banner === '302' || banner === '500'
            ? options.featured?.(banner, time)
            : null
        if (rand() < soft || pity5 >= 90) {
          rank = 5
          pity5 = 0
          if (banner === '301' || banner === '500') {
            const win: boolean = guaranteed || rand() < 0.5
            name = win ? pick(featured?.five ?? EVENT_FIVE) : pick(STANDARD_FIVE)
            guaranteed = !win
          } else if (banner === '302') {
            const win: boolean = guaranteed || rand() < 0.75
            name = win ? pick(featured?.five ?? EVENT_WEAPONS) : pick(STANDARD_FIVE_WEAPONS)
            guaranteed = !win
          } else name = pick(STANDARD_FIVE)
        } else if (rand() < 0.051 || pity4 >= 10) {
          rank = 4
          pity4 = 0
          const pool =
            featured && rand() < 0.5 ? featured.four : rand() < 0.5 ? FOUR_CHARACTERS : FOUR_WEAPONS
          name = pick(pool)
        } else {
          rank = 3
          name = pick(THREE_WEAPONS)
        }
        if (rank === 5) pity4++
        records.push({
          id: String(BigInt(minute) * 1_000_000_000n + BigInt(counter + k)),
          ...(options.uid ? { uid: options.uid } : {}),
          gacha_type: second,
          time: wallClock(time),
          name,
          item_type: isWeapon(name) ? 'Weapon' : 'Character',
          rank_type: String(rank),
          item_id: '',
        })
        if (records.length >= total) break
      }
      counter += size
    }
    out.push(...records.reverse())
  }
  return out
}
