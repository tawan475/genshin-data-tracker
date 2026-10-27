import type { GiCollections } from '@gdt/shared'
import { nameOf, type CollectionCatalog } from './collection-names'

/**
 * The music game (Capture's `gi_collections.musicGame`, by beatmap id: the
 * best score and whether its reward was claimed) against the game data's
 * songs (cover, name, artist) and beatmaps (song, difficulty 1-4, reward).
 * Pure.
 */

export type MusicGame = NonNullable<GiCollections['musicGame']>

export interface Beatmap {
  id: number
  /** 1 Easy … 4 Pro. */
  difficulty: number
  /** Whether the beatmap has a reward (difficulty 4 never does). */
  rewarded: boolean
  /** Played: in the capture. */
  played: boolean
  score: number | null
  claimed: boolean
}

export interface Song {
  id: number
  name: string
  artist: string
  /** The cover's game image name ('' for none). */
  icon: string
  /** One per difficulty the game has for it, easiest first. */
  beatmaps: Beatmap[]
  played: boolean
  /** Played beatmaps whose reward is still waiting. */
  rewardLeft: number
  /** The best score over its beatmaps (0 unplayed). */
  best: number
}

export interface MusicSummary {
  songs: number
  songsPlayed: number
  beatmaps: number
  beatmapsPlayed: number
  rewards: number
  rewardsClaimed: number
  rewardsLeft: number
}

const num = (value: unknown) => (typeof value === 'number' ? value : 0)
const str = (value: unknown) => (typeof value === 'string' ? value : '')

export function musicSongs(catalog: CollectionCatalog, captured: MusicGame): Song[] {
  const bySong = new Map<number, Beatmap[]>()
  for (const row of catalog.data.musicBeatmaps) {
    const entry = captured[String(row.id)]
    const list = bySong.get(num(row.song)) ?? []
    list.push({
      id: row.id,
      difficulty: num(row.difficulty),
      rewarded: num(row.reward) > 0,
      played: !!entry,
      score: entry?.score ?? null,
      claimed: entry?.claimed ?? false,
    })
    bySong.set(num(row.song), list)
  }
  return catalog.data.musicSongs.map((row) => {
    const beatmaps = (bySong.get(row.id) ?? []).sort((a, b) => a.difficulty - b.difficulty)
    return {
      id: row.id,
      name: nameOf(catalog, 'musicSongs', row.id),
      artist: nameOf(catalog, 'musicSongs', row.id, 'artist').replace(/^#\d+$/, ''),
      icon: str(row.icon),
      beatmaps,
      played: beatmaps.some((b) => b.played),
      rewardLeft: beatmaps.filter((b) => b.played && b.rewarded && !b.claimed).length,
      best: Math.max(0, ...beatmaps.map((b) => b.score ?? 0)),
    }
  })
}

export function musicSummary(songs: readonly Song[]): MusicSummary {
  const beatmaps = songs.flatMap((s) => s.beatmaps)
  const rewarded = beatmaps.filter((b) => b.rewarded)
  return {
    songs: songs.length,
    songsPlayed: songs.filter((s) => s.played).length,
    beatmaps: beatmaps.length,
    beatmapsPlayed: beatmaps.filter((b) => b.played).length,
    rewards: rewarded.length,
    rewardsClaimed: rewarded.filter((b) => b.claimed).length,
    rewardsLeft: rewarded.filter((b) => b.played && !b.claimed).length,
  }
}

export type SongFilter = 'all' | 'played' | 'left'
export type SongSort = 'game' | 'score' | 'name'

/** The songs a filter, a search and a sort leave, in that order. */
export function shownSongs(
  songs: readonly Song[],
  filter: SongFilter,
  search: string,
  sort: SongSort,
): Song[] {
  const needle = search.trim().toLocaleLowerCase()
  const list = songs.filter(
    (s) =>
      (filter === 'all' || (filter === 'played' ? s.played : s.rewardLeft > 0)) &&
      (!needle ||
        s.name.toLocaleLowerCase().includes(needle) ||
        s.artist.toLocaleLowerCase().includes(needle)),
  )
  if (sort === 'score') return list.sort((a, b) => b.best - a.best)
  if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name))
  return list
}
