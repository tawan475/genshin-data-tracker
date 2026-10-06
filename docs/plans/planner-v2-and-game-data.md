# Planner v2 (Seelie parity) and a standalone game-data repo

Status: **approved 2026-10-06** (data repo private; clean patches auto-merge and release; CI deploys the
tracker with the gap icons on gi-cdn; order: Part A, then Phase 1). Based on three research reports:
a feature inventory of seelie.me (v7.1 build 260922, read from a blank browser profile and its
public bundles), an audit of our Planner + `@gdt/game-data`, and a survey of Genshin data sources.

## Why the current Planner loses to Seelie

1. Inventory and current levels are read-only and come only from the newest irminsul capture —
   no capture, no planner; farm in game and nothing moves until the next capture.
2. No "Done" that spends materials; a goal completes only when a later capture shows it.
3. What a goal still needs is hidden in a modal behind hover tooltips (unusable on touch).
4. The Farm view is long and repeats itself (~6.6 phone screens for 5 goals; Today shown twice).
5. Not in the phone bottom nav; settings behind an unlabelled icon; shorthand like `×85 · 1,700 · 10d`
   explained only in tooltips; native selects for every level; priority is only a sort key.

What Seelie gets right (the patterns to copy): the planner answers *what do I farm today*,
grouped by resin cost; **every material icon is an inline inventory editor** (need / have /
missing / can-craft, ± and keyboard); "missing" already includes crafting, EXP/ore conversion
and Dream Solvent; runs/resin/days on every card; **avatars of who needs each item** on every
farm card; one auto-saving modal per character with one-click level grids and talent steppers;
**Done consumes the materials**; deactivate instead of delete; readiness colours.

What we can do better than Seelie: irminsul gives exact inventory and character state (Seelie's
HoYoLAB sync needs an extension + proxy and caps counts), our pages update live as captures
arrive, and we have history (actual gains per day).

## Part A — `genshin-game-data`: one source of truth for game data

**Source decision.** Every reliable source is derived from Dimbreath's dump, which lands ~2 days
before each patch (measured for 6.4–7.1) and which our compiler already reads directly; genshin-db,
genshin-data, Genshin Optimizer and paimon.moe republish it 0–13+ days later. Honey Hunter has no
API, sits behind a Cloudflare challenge (even robots.txt) and received a legal notice — not usable.
So: **keep Dimbreath + our compiler as the primary**, and cross-check automatically against
**Project Amber / yatta** (`gi.yatta.moe/api/v2`, same-day 7.1, per-version changelog of new ids,
costs, recipes incl. Dream Solvent, domain weekdays; unofficial, no license → never called at
runtime, only diffed in CI). genshin-db (MIT) breaks ties. nanoka's beta manifest is an early
warning only (never shipped).

**Repo.** Move `packages/game-data` to its own **private** repo `tawan475/genshin-game-data` (compiled
JSON + compiler + hand-kept overrides; **no images**). Contents:
- `data/` — compiled, generated, never hand-edited (planner costs, families, domains, weekly bosses,
  forge, achievements, material index, image names, text).
- `overrides/` — the hand-kept JSON "source of truth" a human edits: domain weekdays, domain/boss
  names, drop rates (with wiki revision ids), game rules (resin, Mora per EXP, forge limits),
  key fixes, unobtainable achievements, plus new tables for Planner v2: farming sources (enemy →
  material families, local specialties by region), artifact set → domain, permanent tasks.
- Releases tagged `7.1.0+792978e5`; consumers pin a tag: npm package and/or
  `cdn.jsdelivr.net/gh/tawan475/genshin-game-data@<tag>/data/*.json`.
- Extraction blockers found (all small): `toGoodKey` import from `@gdt/shared` (copy 9 lines),
  hard-coded `apps/tracker/public/gi` path (→ flag), raw-TS exports (→ add an emit step),
  `drops.json` read from `overrides/` at runtime (→ compile into `data/`), image host in four
  places (→ one constant), app-only logic (`seelie.ts`, `achievement-progress.ts`) stays in the tracker.
- Also fixes found in the audit: generate the tracker's `characters-meta`/`weapons-meta` from this
  data (today they come from Genshin Optimizer by a script that isn't in the repo — new characters
  show without rarity/element), and drop the dead `planEstimate` code.

**Per-patch workflow (automated).**
1. *Daily* GitHub Action in the data repo polls Dimbreath (GitLab project `83871005`, or its
   GitHub mirror) — same idea as irminsul's `game-data-watch.yml`.
2. New dump → `build --ref <sha>` → validation (renamed fields, append-only ids, families without
   weekdays…) → **yatta cross-check** (character/talent/weapon costs, recipes, domain weekdays,
   the version changelog's new ids) → tests.
3. Build fails → one issue with the errors. Build passes → a PR whose body is the change summary
   (new characters/weapons/materials, changed costs, warnings, yatta mismatches).
4. If nothing needs a human (existing region, all checks agree) → auto-merge, tag, publish
   (*decision below*). New region → the PR lists exactly what to fill in (weekdays, domain names,
   farming sources, drop rates).
5. Early warning job: nanoka's manifest shows next-version characters ~6 weeks early → a heads-up
   issue so overrides for a new region can be prepared before the dump lands.
6. The release triggers the tracker (and later irminsul): a dependency-bump PR → tracker CI →
   merge → deploy.

Human-only data per patch: drop rates (server-side), new-region weekdays/names (until yatta
agrees automatically), farming routes/local specialties, events. Everything else flows.

**The tracker needs CI** (it has none): `pnpm test`, type-check, build on every PR; optionally
deploy from CI (needs a Cloudflare API token secret). Caveat: the 87 gap icons are gitignored and
deploy only from the local checkout — a CI deploy needs them served elsewhere (gi-cdn,
origin-locked, is ready) — *decision below*.

## Part B — Planner v2

Built on the same storage; phased so each phase ships on its own.

**Phase 1 — the core loop (fixes the top three problems)**
- *Editable inventory on top of the capture*: inventory = newest capture + manual adjustments made
  after it; a newer capture supersedes older adjustments (irminsul stays the truth, the planner
  never drifts). Stored per account in D1.
- *Inline item editor*: every material icon opens a popover — need (this goal / all goals), have,
  missing, can-craft, an input, ± buttons, keyboard; the same popover everywhere.
- *Editable current state*: current level/ascension/talents default to the capture, can be
  overridden; a newer capture that reaches it clears the override.
- *Done*: per goal part (level, talents, weapon) — sets current = goal and deducts the cost
  (crafting cascade, EXP/ore split) as an inventory adjustment; undo.
- *Per-goal needs on the card*, readable without hover: what's missing, readiness colour with a
  visible legend. Planner in the phone bottom nav.

**Phase 2 — "What to farm today"**
- Today = cards grouped by resin cost (0 / 20 / 40 / weekly / artifacts), each with location,
  runs ×N, resin, condensed, days, the items with missing counts, and **avatars of who needs it**
  (click = open goal, long-press/right-click = deactivate). Server-reset weekday, Sunday = all.
- Schedule tab for the other weekday pairs; one headline "resin • days" with a daily-refresh
  setting. No repeated sections.

**Phase 3 — Goal editing like Seelie**
- One auto-saving modal per character: Level / Talents / Weapon / Artifacts tabs, one-click level
  grid (1, 20, 20✦ … 90), talent steppers, constellation, notes, favourite, active.
- Presets ("max", 90/10/10/10, 80/8/8/8), multi-add from the roster.
- Standalone weapon goals including unowned and duplicates (goals get their own id — fixes the
  key+owner collision).
- *Priority that allocates*: drag to reorder; materials go to higher goals first (Seelie only sorts).
- Custom/unreleased character placeholder, replaceable by the real one later.

**Phase 4 — the rest**
- Artifact goals (sets + main stats; we can auto-tick them from captured artifacts).
- Tasks: permanent dailies/weeklies + custom recurring tasks; resin tracker from irminsul's resin
  with regeneration.
- Seelie import of inventory and current values (today only goals), and export.

Out of scope until data exists: levels 95/100 (not in the dump or any API), local-specialty routes
on a map, event calendars from an official source.

## Order

Part A (data repo + automation + tracker CI) → Phase 1 → Phase 2 → Phase 3 → Phase 4.
Part A first so a new character is a data release, not a code change; Phase 1 next because it is
what sends you back to Seelie today.
