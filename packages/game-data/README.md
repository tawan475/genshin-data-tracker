# @gdt/game-data

Game data the tracker needs beyond what irminsul uploads: achievements (with
text, categories, primogems and the version they were added in), planner costs
(character and weapon ascension, talents, EXP curves, materials and their
families and domain days), where and how materials are farmed (domains and
their tiers, weekly bosses, Dream Solvent and Dust of Azoth conversions, ore
forging, resin items, passives), hand-kept drop rates for the planner's
estimates, a material index, and the name of every game image the tracker
shows (the images themselves load from static.nanoka.cc).

Everything is compiled from the game's own tables in Dimbreath's dump, checked
in under `data/`, and refreshed by a maintainer once per game patch. The app
never talks to the dump.

## What is in it

| File                          | What                                                                                                                                                                                                                                                            | Size (min / gzip) |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `data/meta.json`              | Game version, dump repo, commit sha and title, when it was built                                                                                                                                                                                                | tiny              |
| `data/achievements.json`      | Every achievement: id, category, order, hidden, previous tier, primogems, progress target, version, disused                                                                                                                                                     | 64 KB / 13 KB     |
| `data/achievement-goals.json` | Achievement categories: id, order, icon                                                                                                                                                                                                                         | 3 KB              |
| `data/text/en.json`           | Achievement titles and descriptions, category names                                                                                                                                                                                                             | 190 KB / 58 KB    |
| `data/planner.json`           | Characters (with the talent C3/C5 raise), weapons, ascension and talent tables (AR per phase, ascension per talent level), EXP curves, EXP items, planner materials, material families, domains and tiers, weekly bosses, conversions, forging, resin, passives | 234 KB / 42 KB    |
| `data/materials.json`         | Every GOOD material key the tracker can show -> item id and icon                                                                                                                                                                                                | 235 KB / 78 KB    |
| `data/images.json`            | Image names per character (portrait, namecard, normal attack, skill, burst, C1-C6; the Traveler's portrait by twin), per weapon (icon, ascended), per artifact set (each slot's piece) and for a few items                                                      | 65 KB / 12 KB     |
| `data/missing-images.json`    | The names static.nanoka.cc lacked at the last `images` check (the app shows initials for them)                                                                                                                                                                  | 39 KB / 5 KB      |

Rows are tuples; each file names its columns. `src/format.ts` documents every
shape. The app uses the typed loaders in `src/index.ts`, which dynamic-import
the JSON so Vite gives each file its own chunk:

```ts
import {
  loadAchievements,
  achievementText,
  loadPlanner,
  loadMaterialIndex,
  loadMissingImages,
  GAME_DATA,
} from '@gdt/game-data'

const { achievements, byId, goals } = await loadAchievements()
const text = await achievementText('en') // text.achievements.get(id)?.title
const planner = await loadPlanner() // planner.characters.get('HuTao').talents.normal[9].items
```

The planner's pure math lives in subpath modules (`@gdt/game-data/<file>`),
all synchronous over `loadPlanner()` data and tested in Node:

| Module             | What                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planner-math`     | Goal costs (talents raise the ascension costed), item goals, totals against an inventory with crafting and the `PlanOptions` conversions, domain days |
| `planner-convert`  | Crafting (3 -> 1), Dream Solvent within a weekly boss, Dust of Azoth between gems, Mystic ore forging, the in-game checklist (`craftingSteps`)        |
| `planner-estimate` | Runs, resin, days and Condensed Resin per domain entrance, normal boss, gem, weekly boss and ley line by AR/WL; day schedule, today, resin now        |
| `planner-goals`    | Valid targets (raise or clamp talents), Seelie's three stock states per goal, the furthest step a goal can take now                                   |
| `drops`            | `overrides/drops.json` (wiki drop rates): `loadDropRates()`, `parseDropRates()`                                                                       |
| `seelie`           | Goals from a Seelie export                                                                                                                            |

`@gdt/game-data/images` resolves image names synchronously (`characterImages`,
`weaponImages`, `artifactImage`, `itemImage`, `travelerIcon`); the app turns
every name into `https://static.nanoka.cc/assets/gi/<name>.webp` in
`apps/tracker/src/lib/assets.ts`.

## Refreshing after a game patch

Dimbreath dumps each version on patch day. Then:

```bash
# 1. Compile at the new dump commit (or pass a sha). Downloads ~110 MB once into .cache/.
pnpm --filter @gdt/game-data build --ref latest

# 2. Read the printed summary: new achievements, characters, weapons, materials,
#    families, and anything whose costs changed. Fix every ERROR (see below) and
#    rerun; warnings are worth a look too. Nothing is written while errors remain.

# 3. Check the image names on static.nanoka.cc (only new and missing ones are asked).
pnpm --filter @gdt/game-data images

# 4. Test, then commit data/ and overrides/ together.
pnpm test
```

`pnpm --filter @gdt/game-data build` without `--ref` rebuilds at the sha in
`data/meta.json`, so a build is reproducible. `--dry-run` compiles, checks and
prints the summary without writing. The dump has moved before: point the build
at a new home with `--raw-url` / `--api-url` (or `GDT_DUMP_RAW_URL` /
`GDT_DUMP_API_URL`). Use `--game-version 7.2` when the commit title names no
version.

### When the build fails

Every error says what to change. The usual ones:

| Error                                                  | Cause                                                           | Fix                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field "x" is in 0 of N rows`                          | The game renamed or obfuscated a field this version             | Find the field's new name in the raw JSON under `.cache/dump/<sha>/` and update the compiler in `scripts/compile/` (the spec next to `checkFields`) |
| `family X has no domain days`                          | A new region's talent books or weapon materials                 | Add the family to `overrides/weekdays.json`; the error suggests the days from the game's domain list                                                |
| `GOOD key "X" comes from ids a, b with different data` | Two game entries make the same key (a quest or trial copy)      | Exclude the wrong id in `overrides/keys.json`                                                                                                       |
| `N achievement ids compiled before are gone`           | The game removed achievements (or the build is wrong)           | If the game really removed them, list them in `overrides/keys.json` `removed.achievements`                                                          |
| `unknown weaponType` / `qualityType`                   | A new kind of character or weapon                               | Add it to the maps at the top of `scripts/compile/planner.ts`, or exclude the entry                                                                 |
| `family X is in no domain entry`                       | The domain reward list changed shape                            | Check `DungeonEntryExcelConfigData.descriptionCycleRewardList` and `compileDomains` in `scripts/compile/farming.ts`                                 |
| `Weekly material X is in no Dream Solvent trio`        | A new weekly material outside every trio (a quest reward)       | Confirm it in game; add it to `overrides/planner.json` `unfarmable` with the reason                                                                 |
| `Weekly trio … has no boss name`                       | A weekly boss outside domains                                   | Add its name to `overrides/planner.json` `weeklyBossNames`                                                                                          |
| `overrides/drops.json: …`                              | A malformed drop rate entry                                     | Fix the entry; see `overrides/README.md`                                                                                                            |
| `Planner materials X and Y share the GOOD key`         | Two cost items have the same name                               | Give one a key in `overrides/keys.json` `materials.key` (match what irminsul exports)                                                               |
| `Character X: …icon…`, `Artifact set X: …`             | An image table changed shape (a new kind of skill depot or set) | Read the raw rows and adjust `scripts/compile/images.ts`; `pnpm --filter @gdt/game-data test` compares the names with Genshin Optimizer's           |

GOOD keys are made exactly as irminsul makes them: the name from
`TextMap_MediumEN` through `toGoodKey` (`packages/shared/src/good.ts`). The
build warns when irminsul's Rust version would produce a different key.

## Hand-kept data: `overrides/`

The game data lacks a few things, and a few entries need a human decision.
`overrides/README.md` explains each file:

- `weekdays.json`: domain days per talent book and weapon material family
  (checked against the game's own domain reward list).
- `achievement-versions.json`: the version each achievement was added in.
- `achievement-unobtainable.json`: achievements nobody can earn (datamine-only,
  not obtainable yet), compiled as disused; the build checks it against stardb.gg.
- `keys.json`: GOOD key fixes, exclusions, inclusions and acknowledged removals.
- `planner.json`: domain entrance names, weekly boss names the data lacks,
  weekly materials no boss drops.
- `drops.json`: average drops per run from the Genshin Impact Wiki, every
  section citing a page revision; the planner estimates only what it has.
  Re-check it after a patch (the build compares it with the game's previews).

## Images

Every game image the tracker shows comes from one host,
`https://static.nanoka.cc/assets/gi/<name>.webp` (WebP, CORS open, behind
Cloudflare), and every name comes from the dump: the material index, the
achievement categories and `data/images.json` (see
`scripts/compile/images.ts` for where each name is read). Nothing is
mirrored into the repo.

`pnpm --filter @gdt/game-data images` sends one HEAD request per name
(`gdt-game-data` User-Agent, 4 at a time, backing off on errors), caches the
names found in `.cache/images/`, and writes the ones the host lacks to
`data/missing-images.json`; `--all` asks about every name again. Its report
groups the missing names by kind and lists any outside materials. Run it
after every `build`: a test fails while the build has names it never checked.

Known gaps (7.1): about 170 material icons (old event and quest items, TCG
icons) and almost all TCG card art; the app shows initials for them. Bursts
use the dump's own `skillIcon` (64 px); the `_HD` variant other tools use is
the same art at 128 px, which the host lacks for 17 newer characters.

If the host goes away, any CDN or a self-hosted copy with the same
`<name>.webp` layout works: change `IMAGE_BASE` in
`apps/tracker/src/lib/assets.ts`, `IMAGE_HOST` here
(`scripts/lib/image-names.ts`) and in `apps/tracker/src/pwa/sw-template.js`,
and the preconnect in `apps/tracker/index.html`.

## Tests

`pnpm --filter @gdt/game-data test` (also run by `pnpm test` at the root):

- every character's ascension and talent costs equal Genshin Optimizer's
  (`test/fixtures/go-character-costs.json`, a trimmed copy of GO's
  `allCharacterMats_gen.json`), plus the Traveler and Manekin special cases;
- achievement count, primogems, hidden flags and category sizes agree with a
  stardb summary (`test/fixtures/stardb-achievements.json`);
- weekday coverage, families, EXP curves, the material index;
- every image name equals Genshin Optimizer's asset table where GO names it
  (`test/fixtures/go-assets.json`, 1,971 names: portraits, namecards, skills,
  bursts, constellations, weapons, artifact pieces), and
  `data/missing-images.json` was refreshed after the last build;
- the build's own checks (field presence, version precedence, append-only,
  key choice) on small made-up inputs.

`node scripts/make-test-fixtures.ts` refreshes the fixtures from GO and
stardb when they have caught up with a new version.

## Known limits

- Levels 95 and 100 are not planned: their table (`AvatarExtraLevel`) is
  obfuscated and the EXP for levels 91-100 is not in the dump. Targets stop at 90.
- Mora per EXP point (1 per 5 character EXP, 1 per 10 weapon EXP) is a game
  rule written in `scripts/compile/planner.ts`, not read from the dump; so are
  Original Resin's cap (200) and regeneration (8 minutes) in
  `src/planner-estimate.ts`.
- Drop rates are community data (the wiki's averages), shown as estimates.
  The wiki has no normal boss or Andrius averages for World Level 9, so those
  get no estimate there. The blacksmith's daily forging limit and crafting
  passives' chances are not counted in totals.
- The element-less Traveler (before resonating with a Statue) has no planner
  entry; irminsul exports it as plain `Traveler`.
- Achievement versions come from stardb for everything up to 7.1; newer
  achievements get the dump's version when they first appear, which is right
  unless an achievement is added to the game data before its version ships.

## Credits

Game data, text and images © HoYoverse. The data comes from Dimbreath's dump
(https://gitlab.com/Dimbreath/animegamedata2), which asks to be credited.
Achievement versions were seeded from stardb.gg. Drop rates come from the
Genshin Impact Wiki (genshin-impact.fandom.com, CC BY-SA), each cited by page
revision in `overrides/drops.json`. Images are loaded from static.nanoka.cc
(Hakushin's image host); their names come from the dump. Genshin Optimizer
(MIT) is used only as a test oracle for costs and image names.
