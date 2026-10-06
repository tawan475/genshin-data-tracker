# Planner v2 (Seelie parity) and a standalone game-data repo

Status: **approved 2026-10-06** (data repo private; clean patches auto-merge and release; CI deploys the
tracker with the gap icons on gi-cdn; order: Part A, then Phase 1); Part B built through Phase 4b.
Based on three research reports: a feature inventory of seelie.me (v7.1 build 260922, read from a
blank browser profile and its public bundles), an audit of our Planner + `@gdt/game-data`, and a
survey of Genshin data sources.

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

**Phase 1 — the core loop (fixes the top three problems)** — *built 2026-10-06* (migration 0011:
`inventory_adjustments` + `planner_targets.current`; `/planner-state`; `hand-edits.ts`, `done.ts`,
`needs.ts`, `ItemPopover` on the kit's `UiPopover`). Decisions: an edit is tied to the newest
capture's `lastSeenAt`, so a capture seen again later also replaces it; a hand-set current state
counts field by field only where it is ahead of the capture (no timestamp needed to retire it); the
planner math stayed in the tracker, no data-repo release.
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

**Phase 2 — "What to farm today"** — *built 2026-10-06* (`farm-today.ts` regroups
`farmPlan`'s estimates; `FarmCard`, `CraftCard`, `GoalAvatars` with `goal-actions.ts`; account
setting `planner.refreshes`, 0–6, no migration: settings are JSON merged with defaults).
- Today = cards grouped by resin cost (0 / 20 / 40 / weekly / artifacts), each with location,
  runs ×N, resin, condensed, days, the items with missing counts, and **avatars of who needs it**
  (click = open goal, long-press/right-click = deactivate). Server-reset weekday, Sunday = all.
- Schedule tab for the other weekday pairs; one headline "resin • days" with a daily-refresh
  setting. No repeated sections.
- Built as: the old Sources/Schedule/Craft tabs, the tiles row and the second Today block are
  gone. 0 resin holds local specialties, common and elite enemy drops, enhancement ore (with
  "Forge from chunks"), what has no resin source (crowns, Brilliant Diamond, quest-only weekly
  materials) and a compact Crafting card (crafts, Dream Solvent / Dust of Azoth conversions,
  forging); 20 holds today's domains and the two ley lines; 40 normal boss drops and gems; 30/60
  weekly bosses. No artifacts group yet (artifact goals are Phase 4). Locked cards (AR/WL too
  low) are greyed with what they need ("AR 40"). Days count 180 + 60 × refreshes a day.
- Also: the Materials page tiles open the same inventory editor (with a link to the history,
  hand-set counts shown in the bag); the editor has an "add obtained" field per row (adds on
  Enter or leaving it). The planner data pipeline both pages share is `use-planner-model.ts`.
  Dev only: `?at=<ISO or ms>` on the Planner pins the farm clock (another server day).
- Data gaps for the data repo (cards list items without a place rather than guess): normal boss
  names (a boss card is named after its drop; gems can't be tied to a boss), enemy names per
  common/elite drop family, local specialty regions, which gem family each normal boss drops.

**Phase 3 — Goal editing like Seelie** — *built 2026-10-06* (migration 0012:
`planner_weapon_goals`; `GoalModal`, `LevelGrid`, `NumberStepper`, `WeaponGoalBlock`,
`WeaponChooser`, `RosterGrid`, `CustomForm`; pure `level-grid.ts`, `presets.ts`, `allocation.ts`,
`weapon-copies.ts`, `custom-character.ts`, `goal-ids.ts`).
- One auto-saving modal per card (`?goal=` in the URL): Level / Talents / Weapon tabs (the
  Artifacts tab is Phase 4's slot), one-click level grid (1, 20, 20✦ … 90; "now" can't go below
  the capture, setting it past the goal moves the goal), talent steppers with C3/C5 marked and the
  in-game level, a warning with a one-click fix when talents need more ascension than the goal
  level, constellation stepper (stored as `constellation`, the capture's counts when higher),
  presets, folding note, favourite, counted, delete with Undo (hand-set states come back too). Each
  change goes through the existing optimistic stores (sent after 500 ms); no Save button. Phones
  get the full-screen sheet.
- Presets: Max, 90/9/9/9, 80/8/8/8, Talents only (9/9/9), Level only (90); never below now.
  Multi-add: the roster (owned first, element / weapon / rarity filters) picks several at once with
  one preset; bulk edit of selected cards (preset, pause / count, remove), each with Undo.
- Weapon goals have their own id (client-made, `[a-z0-9]{6,32}`) in `planner_weapon_goals`
  (`planner_targets`' key stays kind + key + owner and is not rebuilt; 0012 copied every weapon
  row with its target and hand-set state, then deleted it there). Any weapon, owned or not, the
  same one twice. Copies in the capture go to goals without sharing (holders, then spares; one
  goal alone still follows its copy to whoever holds it). Apps from before 0012 still write by
  weapon + owner (first such goal; removals take all). The Seelie import keeps weapon goals in
  file order and matches them to stored ones in order, so a re-import changes nothing.
- *Priority that allocates*: in Priority order cards carry a handle (drag with mouse or finger,
  arrow keys / Home / End); the order is stored as priorities 1…n (`weaponTarget.priority` for a
  weapon on its own card). A card is Ready when the bag covers it after the counted cards above
  it; a paused card is costed where it stands and takes nothing. Farm totals are unchanged.
- Custom character: a goal of kind `custom` (id lowercase-first, never a GOOD key) whose target
  carries name, rarity, element, weapon type and materials (book / enemy drop families, boss,
  specialty, weekly; unknown ones left out of the cost). It is costed as a regular character of
  its rarity with those materials swapped in, so totals, Done and Today work unchanged; "Replace
  with…" turns it into the real character, its weapon goals and hand-set state moved along.
- Also: "Resin now ~180 · +120 in bag" in the farm headline; a farm card's "+N" shows every
  portrait. Levels read 80✦ everywhere (was 80+).

**Phase 4a — names on Today, artifact goals, fixes** — *built 2026-10-06* (no migration; game data
7.1.2 for artifact domains). Decisions:
- Today names its places from `@gdt/game-data/farming`: boss cards by boss (a gem a single-element
  boss on a card drops joins that card, the runs being the longer of the two; other gems get a card
  named after their bosses, single-element first), a card per enemy for common/elite drops (the
  other enemies underneath), local specialties per region (areas underneath). The handbook AR never
  greys a boss. World Level 9 boss estimates read "at most N runs" (headline "≤").
- Artifact goals are an optional `artifacts` object on the character goal's target (`artifactGoal`
  in `packages/shared/src/api.ts`: sets with an optional hand tick, Sands/Goblet/Circlet main stats,
  per-slot hand ticks). Auto-tick (`artifact-goals.ts`): a slot is done when the character wears a
  piece there at its top level for its rarity (+20 on a 5★), of a chosen set (the fifth slot is free
  once the other four are chosen sets) with a chosen main stat; none chosen = any. A set is done
  when every slot is. Hand ticks win both ways; a tap back to what the capture says clears them.
  The Traveler's gear is on "Traveler". A card is done when its levels and its artifacts are; a card
  with only artifacts left shows "Artifacts" instead of a readiness.
- Today's "Artifacts" section (20 resin, no run estimate): the domains (`farming.artifactDomains`,
  read through `artifact-domains.ts` so older game data still builds) of the sets counted goals
  still want; sets no domain drops go to "Elsewhere".
- Fixes: the goal editor's cost legend counts the tiles of each colour (`cost-cells.ts`).
  Readiness work is linear (the goals above summed as one) with a memo that keeps each goal's own
  totals and redoes only the goals from the first change down; unchanged cards keep their objects
  (`keep-unchanged.ts`) so only changed cards re-render; long lists mount a few cards per frame
  (`use-progressive.ts`), cards off screen skip layout (`content-visibility`), and both views stay
  mounted once shown. At 100 goals on a 4× slowed CPU: toggle ~75 ms, move ~80 ms, open a goal
  ~110 ms, first view of a tab ~180–200 ms (was 0.6–2.3 s).

**Phase 4b — tasks, resin tracker, Seelie both ways** — *built 2026-10-06* (migration 0013:
`planner_tasks`; `tasks.ts`, `resin.ts`, `resin-alerts.ts`, `seelie-plan.ts`, `seelie-slugs.ts`,
`@/data/seelie-extras`, `@/data/seelie-export`; `TasksStrip`, `TaskEditor`, `ResinTracker`; game data
7.1.2, so `artifact-domains.ts` reads `@gdt/game-data/farming`'s `ArtifactDomain` directly). Decisions:
- Tasks sit at the top of the Farm tab (both views, so the Today/Schedule switch doesn't jump),
  collapsible, tabs All / Permanent / Custom. Built-in ones are the resets the game keeps, in server
  time (fixed offsets, 04:00): Daily Commissions (daily), Trounce Domains, Battle Pass weekly,
  reputation (Monday), Spiral Abyss (the 16th, monthly since 4.7), Imaginarium Theater and Paimon's
  Bargains (the 1st), Parametric Transformer (166 h after use). A row is red when it isn't done
  and its reset is close (3 h daily, 1 day weekly, 3 days monthly). Done rests it until the next
  reset (Undo in the toast), a snooze until a later day before the reset ("Last day" marked), "show
  done" lists the resting ones ticked (a tick takes it back); each can be hidden. Custom tasks are
  Seelie's: name, every 1–7 days, start day, from the start day's rhythm or from the day done, note;
  stored by their due game day, reordered by handle in the Custom tab. Stygian Onslaught, Disturbance
  Outbreak, banners and events follow the patch calendar (no official machine-readable source): left
  out. Table `planner_tasks` (account, kind, id, JSON `data`), routes `/planner-tasks`, writes tell
  open pages (`planner` live event); account settings writes now do too.
- Resin tracker: Original Resin now from the newest reading, the capture's (irminsul's at login, else
  the snapshot's count) or one set by hand (account setting `resin {value, at}`), which counts until a
  capture reads resin after it (a login later; a capture in the same session leaves it). −40/+60
  (account setting `planner.resinSteps`, up to four) keep the regeneration clock; the number sets it;
  full at, the next 40, Condensed held/most. Alerts: the browser's Notification API at an amount
  chosen per device, a timer in the open tab (survives leaving the Planner, not closing the site; no
  push server), shown through the service worker when there is one (its `notificationclick` focuses
  the site).
- Seelie: every section of an account export is opt-in (goals, artifact goals, custom characters,
  current levels as hand-set states, inventory as hand edits on the capture, tasks, resin, settings)
  with new/changed/same per section; AR/WL that irminsul already gives and a set server start
  unticked. Slugs map through Seelie's identifiers (items by game id, characters/weapons/artifact
  sets by rule with exceptions; 14 weapon slugs the old import missed). Export writes Seelie's
  account keys for goals, inventory, tasks, resin and settings only (its import keeps the rest,
  achievements included); importing our export changes nothing. Known loss: Seelie pauses a paused
  character's weapon goals too.

Out of scope until data exists: levels 95/100 (not in the dump or any API), local-specialty routes
on a map, event calendars from an official source.

## Order

Part A (data repo + automation + tracker CI) → Phase 1 → Phase 2 → Phase 3 → Phase 4.
Part A first so a new character is a data release, not a code change; Phase 1 next because it is
what sends you back to Seelie today.
