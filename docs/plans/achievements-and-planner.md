# Achievements tracker, planner, and our own game data

Status: phases 1–4 shipped 2026-10-04 (live); phase 5 open · Owner: the user (tawan475) · Built by Claude Code agents in phases.

The user tracks achievements on stardb.gg and plans characters on seelie.me and wants both in the
tracker, with game data a maintainer can refresh each patch, and our own item images because
Enka lacks about half of them.

## What we learned

**stardb** (achievement tracker): 1,854 achievements in 73 series. Game fields: id, series
(goal), name, description, primogems (5/10/20), hidden, version. Its own curated fields
(guide text, difficulty, gacha/missable/timegated/impossible) are stardb's work and are not
copied. It polls Dimbreath's dump for the game fields.

**Seelie** (planner): stores only goals per character (`character` level/ascension, `talent`
normal/skill/burst, `weapon` level/ascension/refinement + owner) and an inventory by material
family and tier. Its Planner groups what is still missing by *where you farm it* (talent book
domain, weapon domain, normal boss, weekly boss, local specialty, common drops), with runs,
resin and days per group, and a headline "N resin, about D days". Export: Settings → Export
Account → `<date>-main-seelie-gi.json` (`goals`, `achievements` {id: {done}}, `inventory`,
`gender`, `server`, …). Its data is hand-kept in its closed JS bundle.

**The tracker already has the current state** from irminsul snapshots: characters (level,
ascension, talents, constellation), weapons, materials (GOOD keys), and completed achievement
ids (`gi_achievements`, only when the player opened the in-game Achievements menu in that
session; the newest snapshot may lack them). So we only need to store *targets* and *manual
achievement marks*.

**Raw data**: Dimbreath's dump (`gitlab.com/Dimbreath/animegamedata2`, ExcelBinOutput +
TextMaps, dumped on patch day) holds achievements (`AchievementExcelConfigData`,
`AchievementGoalExcelConfigData`, rewards), costs (`AvatarPromote`, `AvatarLevel`,
`AvatarSkillDepot` → `AvatarSkill` → `ProudSkill`, `WeaponPromote`, `WeaponLevel`), and material
metadata (`MaterialExcelConfigData`, `MaterialSourceData` → `Dungeon`). Not in the dump:
achievement "version added" (seed once from stardb, credited; new ids get the current version
automatically), domain weekdays (obfuscated; hand-kept, ~3 families per region), average drops
per run (community data; hand-kept, marked approximate). GO's `allCharacterMats_gen.json` is a
test oracle for costs.

**Images**: Enka 404s on 49% of material icons, including all 112 newer planner materials.
gi.yatta.moe has 515/515 planner materials and every achievement category; static.nanoka.cc
fills some more. Source PNGs are 256²; 128px WebP ≈ 4.4 KB → ~2.3 MB (planner) / ~13 MB (all).

## Design

### 1. `packages/game-data` (`@gdt/game-data`)
Game data compiled from the dump, committed, refreshed by one command per patch.

- `pnpm --filter @gdt/game-data build [--ref <sha>]` downloads the needed Excel files and the
  English TextMaps (main + `_Medium`) at a pinned commit into a gitignored cache, compiles,
  applies `overrides/*.json`, validates, writes sorted stable JSON to `data/`, and prints a diff
  (new achievements, characters, weapons, materials). `data/meta.json` records game version,
  repo, sha. The base URL is configurable (the dump has moved before).
- Compiled files (compact tuples/ids, lazy-loaded by the app):
  - `achievements.json`: id, goal, order, hidden, prevStage, primogems, progress, version;
    `achievement-goals.json`: id, order, icon; `text/en.json`: achievement + goal names.
  - `planner.json`: characters (GOOD key, game id, rarity, element, weapon type, ascension table,
    talent tables per element for Traveler), ascension tables, talent tables (levels 1→10),
    EXP curves, weapons (GOOD key, rarity, type, ascension table, EXP curve), materials
    (game id → GOOD key, name, rarity, family, tier, icon, source domain/boss, weekdays),
    EXP items.
- `overrides/`: `weekdays.json`, `achievement-versions.json` (seeded from stardb), `drops.json`
  (approximate drops per run), `keys.json` (GOOD-key fixes/exclusions), `icons/` (manual images).
- Validation fails on: planner material without GOOD key/icon/family, book/weapon family without
  weekdays, achievement without text, an expected field missing in most rows (renamed or
  obfuscated), or compiled ids disappearing.
- GOOD keys are derived exactly like irminsul (`TextMap_MediumEN` + `toGoodKey`); map by game id
  internally; never by name (name collisions, quest copies, the "Traveler" placeholders).
- Special cases: Traveler (per-element depots, irminsul keys `TravelerGeo` …), Manekin/Manekina
  (same costs every element), only `skills[0]`, `skills[1]`, `energySkill` are talents.
- Tests (Node vitest): compiled planner costs equal GO's for every shared key; Traveler Geo normal
  attack uses Freedom/Resistance/Ballad; achievements count and primogem total match stardb's.
- `pnpm --filter @gdt/game-data icons`: fetch Enka → yatta → nanoka → `overrides/icons`, send a
  custom User-Agent, convert to 128px WebP (sharp), write `apps/tracker/public/gi/<icon>.webp`
  and a manifest; report what is still missing. Replaces `scripts/make-material-icons.mjs` and the
  Enka material URLs; characters/weapons/artifacts stay on Enka (100% coverage) for now.
- App: `/gi/*` gets a long cache rule in `public/_headers`; the service worker caches `/gi/*`
  cache-first with a larger cap.

### 2. Achievements (`/app/a/:id/achievements`)
- Done = ids in the newest snapshot that has achievements ∪ manual marks. Disused achievements
  are stored but not counted; unknown ids are kept.
- D1 `achievement_marks(account_id, achievement_id, state, updated_at)`, PK (account, id),
  cascade on account; API: list, set/clear (bulk via `json_each`). Not in settings JSON (settings
  ride along on every account request) and not `blobs` (GC'd).
- UI like stardb in the new style: category list with icons and done/total; totals (done,
  primogems collected/total); filters (completion, category, version, hidden), search; multi-stage
  achievements grouped as one card with tiers; mark/unmark by hand; "completed on" from the first
  snapshot that had the id; link to stardb for guides. Imports: Seelie export
  (`achievements`) and stardb/irminsul `{"gi_achievements":[…]}`.

### 3. Planner (`/app/a/:id/planner`)
- D1 `planner_targets(account_id, kind, key, owner, target JSON, updated_at)`, kind
  `character` (level, ascension, talents) | `weapon` (level, ascension, refinement; owner =
  character key, since GOOD weapons have no id).
- Current state from the newest snapshot; requirements = Σ(level EXP as books, ascension
  phases, talent levels, weapon EXP as ore, weapon ascension) from current → target; compare
  with inventory, counting lower-tier conversion (3 → 1) where the game allows it.
- UI: characters with goals (current → target), add/edit goal dialog; "What to farm" grouped by
  source like Seelie (domain with today's weekdays highlighted, normal boss, weekly boss, local
  specialty, common drops) with needed/have/missing; mora and EXP totals; approximate runs, resin
  and days from `drops.json` (labelled estimates). Import goals from a Seelie export (snake_case
  → GOOD keys).
- Per-account Traveler gender setting (the user's Seelie says female → Lumine) for portraits.

## Phases
1. ✅ `@gdt/game-data` + icons pipeline + app wiring of self-hosted icons. (agent)
2. ✅ D1 tables, routes, shared types and tests for marks and targets (migration 0005). (lead)
3. ✅ Achievements page + imports. (agent)
4. ✅ Planner math (pure, tested) + page + Seelie goal import. (agent) Plus `data/avatars.json`
   (portraits for characters/weapons newer than GO's asset table) and the per-account
   Traveler twin setting. (lead)
5. Open: drop rates in `overrides/drops.json` (runs/resin/days stay hidden until then),
   levels 95/100 (not in the dump), Dream Solvent swaps, paimon.moe import, keeping
   Achievements filters across reloads.

## Credits / licensing
Text and images © HoYoverse; non-commercial, credited. Dimbreath (dump) asks for credit; stardb
(version seed) and yatta/nanoka (images) are credited; GO (MIT) is a test oracle only.
