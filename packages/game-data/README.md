# @gdt/game-data

Game data the tracker needs beyond what irminsul uploads: achievements (with
text, categories, primogems and the version they were added in), planner costs
(character and weapon ascension, talents, EXP curves, materials and their
families and domain days), where and how materials are farmed (domains and
their tiers, weekly bosses, Dream Solvent and Dust of Azoth conversions, ore
forging, resin items, passives), hand-kept drop rates for the planner's
estimates, a material index, and the name of every game image the tracker
shows (the images load from static.nanoka.cc, or from gi-cdn.475.dev for the
few that host lacks).

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
| `data/materials.json`         | Every GOOD material key the tracker can show -> item id and icon (furnishing blueprints included)                                                                                                                                                               | 326 KB / 102 KB   |
| `data/images.json`            | Image names per character (portrait, namecard, normal attack, skill, burst, C1-C6; the Traveler's portrait by twin), per weapon (icon, ascended), per artifact set (each slot's piece) and for a few items                                                      | 65 KB / 12 KB     |
| `data/missing-images.json`    | The names static.nanoka.cc lacked at the last `images` check, and which of them load from gi-cdn.475.dev (`hosted`); the app shows initials for the rest                                                                                                        | 37 KB / 5 KB      |

Rows are tuples; each file names its columns. `src/format.ts` documents every
shape. The app uses the typed loaders in `src/index.ts`, which dynamic-import
the JSON so Vite gives each file its own chunk:

```ts
import {
  loadAchievements,
  achievementText,
  loadPlanner,
  loadMaterialIndex,
  loadImageCoverage,
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
`weaponImages`, `artifactImage`, `itemImage`, `travelerIcon`), and
`@gdt/game-data/image-url` turns a name into its URL (`imageUrlOf`, with
`loadImageCoverage()`): `https://static.nanoka.cc/assets/gi/<name>.webp`,
`https://gi-cdn.475.dev/ui/<name>.webp` for a `hosted` name that host lacks, or
'' (initials).
The app does this in `apps/tracker/src/lib/assets.ts`.

## Refreshing after a game patch

Dimbreath dumps each version on patch day. Then:

```bash
# 1. Compile at the new dump commit (or pass a sha). Downloads ~110 MB once into .cache/.
pnpm --filter @gdt/game-data build --ref latest

# 2. Read the printed summary: new achievements, characters, weapons, materials,
#    families, and anything whose costs changed. Fix every ERROR (see below) and
#    rerun; warnings are worth a look too. Nothing is written while errors remain.

# 3. Update the private gi-cdn checkout from the client (game closed; see its README).
(cd ../gi-cdn && pnpm run update)

# 4. Check the image names on static.nanoka.cc (only new and missing ones are asked);
#    the missing ones gi-cdn has built become `hosted` (see Images).
pnpm --filter @gdt/game-data images --gi-cdn-dir ../gi-cdn

# 5. Publish that list on gi-cdn and deploy it, before the tracker.
(cd ../gi-cdn && pnpm run stage --from ../genshin-data-tracker/packages/game-data/data/missing-images.json && pnpm run deploy)

# 6. Test, commit data/ and overrides/ together, then deploy the tracker.
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

Game images come from `https://static.nanoka.cc/assets/gi/<name>.webp` (WebP,
CORS open, behind Cloudflare), and every name comes from the dump: the
material index, the achievement categories and `data/images.json` (see
`scripts/compile/images.ts` for where each name is read). The few names that
host lacks load from `https://gi-cdn.475.dev/ui/<name>.webp` when gi-cdn has
them: native-size WebPs extracted from the game client by the private
`gi-cdn` repo (a sibling checkout), which publishes only this package's
`hosted` list and serves it only to the tracker's pages (by `Origin` or
`Referer`). No image is kept in this repo.

`pnpm --filter @gdt/game-data images` sends one HEAD request per name
(`gdt-game-data` User-Agent, 4 at a time, backing off on errors), caches the
names found in `.cache/images/`, and writes the ones the host lacks to
`data/missing-images.json` `missing`; `--all` asks about every name again.
With `--gi-cdn-dir <gi-cdn checkout>` (relative to where pnpm runs), each
missing name the app can show (everything but TCG card art, which no player
holds as an item) that gi-cdn has built (`public/ui/<name>.webp` there) is
listed in `hosted`; without it, the previous `hosted` names that are still
missing are kept. A name the host now serves leaves the list. Then it asks
gi-cdn.475.dev for each hosted name and warns (never fails) about any it
doesn't serve yet. The report groups the missing names by kind, lists the
ones that stay initials, and names any currency, resin or planner material
without an icon. Run it after every `build`: a test fails while the build has
names it never checked. When `hosted` changes, stage and deploy gi-cdn
(`pnpm run stage --from <this package>/data/missing-images.json`, then
`pnpm run deploy` there) before the tracker; until then those icons 404 and
show initials.

Names are looked up exactly as the game writes them, typos included: the
game's own `Ul_Itemlcon_121565` (lowercase L for I) is on gi-cdn under that
name.

Known gaps (7.1): 186 names the app can show are missing on the host; 87 load
from gi-cdn (936 KB), and 99 are in neither the host nor the client (85 item
icons, mostly old event, quest and placeholder items; 8 weapon and 6 artifact
piece icons of things the game never released), so the app shows initials
for them. The 623 TCG card pictures the host lacks are not on gi-cdn. Bursts
use the dump's own `skillIcon` (64 px); the `_HD` variant other tools use is
the same art at 128 px, which the host lacks for 17 newer characters.

If the host goes away, any CDN with the same `<name>.webp` layout works
(gi-cdn's local build has every name the client has; it would have to publish
them): change `IMAGE_BASE` in
`apps/tracker/src/lib/assets.ts`, `IMAGE_HOST` here
(`scripts/lib/image-names.ts`) and in `apps/tracker/src/pwa/sw-template.js`,
and the preconnect in `apps/tracker/index.html`. gi-cdn's address is
`GI_CDN_BASE` / `GI_CDN_HOST` / `IMAGE_HOSTS` in the same three files.

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
  `data/missing-images.json` was refreshed after the last build, and
  `hosted` holds only missing names the app shows; URLs resolve to the host,
  gi-cdn or initials, and a made-up bag has an icon for every item;
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
(Hakushin's image host), the few it lacks from gi-cdn.475.dev (our own
extraction from the game client); their names come from the dump. Genshin Optimizer
(MIT) is used only as a test oracle for costs and image names.
