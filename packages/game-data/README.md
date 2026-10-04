# @gdt/game-data

Game data the tracker needs beyond what irminsul uploads: achievements (with
text, categories, primogems and the version they were added in), planner costs
(character and weapon ascension, talents, EXP curves, materials and their
families and domain days), a material index for icons, and self-hosted
material and achievement icons.

Everything is compiled from the game's own tables in Dimbreath's dump, checked
in under `data/`, and refreshed by a maintainer once per game patch. The app
never talks to the dump.

## What is in it

| File                                  | What                                                                                                          | Size (min / gzip)    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------- |
| `data/meta.json`                      | Game version, dump repo, commit sha and title, when it was built                                              | tiny                 |
| `data/achievements.json`              | Every achievement: id, category, order, hidden, previous tier, primogems, progress target, version, disused   | 64 KB / 13 KB        |
| `data/achievement-goals.json`         | Achievement categories: id, order, icon                                                                       | 3 KB                 |
| `data/text/en.json`                   | Achievement titles and descriptions, category names                                                           | 190 KB / 58 KB       |
| `data/planner.json`                   | Characters, weapons, ascension and talent tables, EXP curves, EXP items, planner materials, material families | 226 KB / 40 KB       |
| `data/materials.json`                 | Every GOOD material key the tracker can show -> item id and icon                                              | 235 KB / 78 KB       |
| `data/icons.json`                     | Which icons are self-hosted (by source) and which no source has                                               | 57 KB / 8 KB         |
| `../../apps/tracker/public/gi/*.webp` | The icons, 128 px WebP                                                                                        | ~2,600 files, ~12 MB |

Rows are tuples; each file names its columns. `src/format.ts` documents every
shape. The app uses the typed loaders in `src/index.ts`, which dynamic-import
the JSON so Vite gives each file its own chunk:

```ts
import {
  loadAchievements,
  achievementText,
  loadPlanner,
  loadMaterialIndex,
  loadIconManifest,
  GAME_DATA,
} from '@gdt/game-data'

const { achievements, byId, goals } = await loadAchievements()
const text = await achievementText('en') // text.achievements.get(id)?.title
const planner = await loadPlanner() // planner.characters.get('HuTao').talents.normal[9].items
```

Material and achievement icons are served from `/gi/<icon>.webp`; see
`gameIcon()` and `materialIcon()` in `apps/tracker/src/lib/assets.ts`.
Characters, weapons and artifacts still come from Enka (it has all of them).

## Refreshing after a game patch

Dimbreath dumps each version on patch day. Then:

```bash
# 1. Compile at the new dump commit (or pass a sha). Downloads ~110 MB once into .cache/.
pnpm --filter @gdt/game-data build --ref latest

# 2. Read the printed summary: new achievements, characters, weapons, materials,
#    families, and anything whose costs changed. Fix every ERROR (see below) and
#    rerun; warnings are worth a look too. Nothing is written while errors remain.

# 3. Fetch icons for anything new (only new icons are downloaded).
pnpm --filter @gdt/game-data icons

# 4. Test, then commit data/, overrides/ and apps/tracker/public/gi/ together.
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

| Error                                                  | Cause                                                      | Fix                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field "x" is in 0 of N rows`                          | The game renamed or obfuscated a field this version        | Find the field's new name in the raw JSON under `.cache/dump/<sha>/` and update the compiler in `scripts/compile/` (the spec next to `checkFields`) |
| `family X has no domain days`                          | A new region's talent books or weapon materials            | Add the family to `overrides/weekdays.json`; the error suggests the days from the game's domain list                                                |
| `GOOD key "X" comes from ids a, b with different data` | Two game entries make the same key (a quest or trial copy) | Exclude the wrong id in `overrides/keys.json`                                                                                                       |
| `N achievement ids compiled before are gone`           | The game removed achievements (or the build is wrong)      | If the game really removed them, list them in `overrides/keys.json` `removed.achievements`                                                          |
| `unknown weaponType` / `qualityType`                   | A new kind of character or weapon                          | Add it to the maps at the top of `scripts/compile/planner.ts`, or exclude the entry                                                                 |
| `Planner materials X and Y share the GOOD key`         | Two cost items have the same name                          | Give one a key in `overrides/keys.json` `materials.key` (match what irminsul exports)                                                               |

GOOD keys are made exactly as irminsul makes them: the name from
`TextMap_MediumEN` through `toGoodKey` (`packages/shared/src/good.ts`). The
build warns when irminsul's Rust version would produce a different key.

## Hand-kept data: `overrides/`

The game data lacks a few things, and a few entries need a human decision.
`overrides/README.md` explains each file:

- `weekdays.json`: domain days per talent book and weapon material family.
- `achievement-versions.json`: the version each achievement was added in.
- `keys.json`: GOOD key fixes, exclusions, inclusions and acknowledged removals.
- `drops.json`: approximate drops per run (empty until the planner estimates exist).
- `icons/`: images for icons no source has; they win over every source.

## Icons

`pnpm --filter @gdt/game-data icons` builds the set from `data/materials.json`
and `data/achievement-goals.json`, takes each icon from the first of
`overrides/icons/`, Enka, gi.yatta.moe and static.nanoka.cc that has it,
scales it to fit 128 px, writes WebP to `apps/tracker/public/gi/` and records
the result in `data/icons.json`. Requests carry a `gdt-game-data` User-Agent,
run 4 at a time and back off on errors; downloads and misses are cached in
`.cache/icons/`. Flags: `--retry-missing` (ask the sources again for icons none
had), `--refresh` (re-fetch and re-convert everything), `--prune` (delete files
no longer in the set).

Left out on purpose: TCG card faces and backs (large card art none of the
sources host). The report lists the ~95 icons no source has; drop a PNG into
`overrides/icons/<name>.png` to fill one. If you replace an icon file that
clients may already have, bump `GI_IMAGES` in `apps/tracker/src/pwa/sw-template.js`.

## Tests

`pnpm --filter @gdt/game-data test` (also run by `pnpm test` at the root):

- every character's ascension and talent costs equal Genshin Optimizer's
  (`test/fixtures/go-character-costs.json`, a trimmed copy of GO's
  `allCharacterMats_gen.json`), plus the Traveler and Manekin special cases;
- achievement count, primogems, hidden flags and category sizes agree with a
  stardb summary (`test/fixtures/stardb-achievements.json`);
- weekday coverage, families, EXP curves, the material index, the icon
  manifest against the files in `public/gi`;
- the build's own checks (field presence, version precedence, append-only,
  key choice) on small made-up inputs.

`node scripts/make-test-fixtures.ts` refreshes both fixtures from GO and
stardb when they have caught up with a new version.

## Known limits

- Levels 95 and 100 are not planned: their table (`AvatarExtraLevel`) is
  obfuscated and the EXP for levels 91-100 is not in the dump. Targets stop at 90.
- Mora per EXP point (1 per 5 character EXP, 1 per 10 weapon EXP) is a game
  rule written in `scripts/compile/planner.ts`, not read from the dump.
- The element-less Traveler (before resonating with a Statue) has no planner
  entry; irminsul exports it as plain `Traveler`.
- Achievement versions come from stardb for everything up to 7.1; newer
  achievements get the dump's version when they first appear, which is right
  unless an achievement is added to the game data before its version ships.

## Credits

Game data, text and images © HoYoverse. The data comes from Dimbreath's dump
(https://gitlab.com/Dimbreath/animegamedata2), which asks to be credited.
Achievement versions were seeded from stardb.gg. Icons are mirrored from
Enka.Network, gi.yatta.moe and static.nanoka.cc. Genshin
Optimizer (MIT) is used only as a test oracle for costs.
