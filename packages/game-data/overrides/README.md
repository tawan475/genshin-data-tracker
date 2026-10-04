# overrides

Hand-kept inputs to `pnpm --filter @gdt/game-data build`. The
build validates them and fails on mistakes. In every JSON file, keys starting
with `$` are comments. Rerun the build after editing and read its summary.

## weekdays.json

Which days a domain drops each talent book and weapon material family. The
game data has no usable field for it, so it is kept here.

```json
{
  "talentBooks": { "TeachingsOfFreedom": "mon-thu" },
  "weaponMaterials": { "TileOfDecarabiansTower": "mon-thu" }
}
```

- Key: the family's lowest-tier GOOD key (`TeachingsOfX`, the 2-star weapon material).
- Value: `mon-thu`, `tue-fri` or `wed-sat`. Sunday is always added.
- Each region adds three of each: one per day pair, in the order the domain lists them.

An entry here wins. A family without one takes the days from the game's own
domain reward list (`DungeonEntry`) with a warning: check them in game and add
them here. The build fails only when neither has days, and warns when an entry
here disagrees with the game's list or matches no family.

## planner.json

Names and decisions the game tables don't link. Keys are GOOD keys.

| Section           | What                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domainNames`     | `{ "<Mon/Thu family key>": "Forsaken Rift" }`: each talent/weapon domain entrance's name. The build warns when an entrance has none or a name isn't game text  |
| `weeklyBossNames` | `{ "<lowest-id material of the trio>": "Andrius" }`: a boss name where the data has none (bosses outside domains); wins over the game's monster name           |
| `unfarmable`      | `{ "<weekly material key>": "why" }`: weekly materials no boss drops and Dream Solvent can't make. The build fails on any other weekly material outside a trio |

A new region adds two domain entrances: add their names (the build's warning
names the key to use).

## achievement-versions.json

The version each achievement was added in, as `{ "4.2": [ids…] }`. The game
data has no such field. It was seeded once from stardb.gg with
`pnpm --filter @gdt/game-data seed-achievement-versions`. After that the build
keeps the version an achievement was first compiled with and gives new ones the
dump's game version, so this file only needs an edit to correct a version:
move the id to the right list.

## keys.json

GOOD key fixes and exclusions, by game id (the ids in the dump's Excel files).

| Section              | What                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `characters.exclude` | `{ "<avatar id>": "why" }`: avatars that pass the playable filter but are not real characters (placeholders)                                                                                                                          |
| `characters.key`     | `{ "<avatar id>": "GoodKey" }`: when irminsul's key differs from the name's `toGoodKey`                                                                                                                                               |
| `weapons.include`    | `{ "<weapon id>": "why" }`: weapons without a lore entry that are still owned (quest weapons); weapons without one are skipped by default                                                                                             |
| `weapons.exclude`    | `{ "<weapon id>": "why" }`: weapons to leave out                                                                                                                                                                                      |
| `weapons.key`        | `{ "<weapon id>": "GoodKey" }`                                                                                                                                                                                                        |
| `materials.key`      | `{ "<item id>": "GoodKey" }`                                                                                                                                                                                                          |
| `materials.prefer`   | `{ "GoodKey": <item id> }`: which item stands for a key several items share (for its icon and item id)                                                                                                                                |
| `removed`            | `{ "achievements": [ids], "goals": [ids], "characters": [keys], "weapons": [keys], "artifacts": [set keys] }`: entries the game really removed. Without this the build fails, because stored marks, goals and snapshots point at them |

Write the reason in the value: the next maintainer will want to know.

## drops.json

Average drops per run for the planner's run, resin and day estimates. One
source only: the Genshin Impact Wiki (genshin-impact.fandom.com). It is
community data, so it is hand-kept and the app shows it as an estimate.
**A number the wiki doesn't give is left out**: the planner then shows no
estimate for that source and bracket rather than a guess.

What comes from the game data instead (`data/planner.json`): the domain tiers
and the AR each needs, resin per domain and ley line run, domain Mora, and
which boss levels (and ARs) drop each weekly trio.

```jsonc
{
  "sources": {
    "<id>": { "page": "Template:Domain Levels/Mastery", "url": "https://genshin-impact.fandom.com/wiki/…?oldid=1681616",
              "revid": 1681616, "read": "2026-10-04", "note": "what was read where" }
  },
  "domains": {
    "talent": { "sources": ["<id>"], "tiers": [{ "tier": 4, "perRun": [2.2, 1.98, 0.22], "firstRoll": 2.2 }] },
    "weapon": { … }
  },
  "bosses": { "resin": 40, "sources": [], "byWorldLevel": [{ "wl": 8, "boss": 2.5556, "gems": [2.1607, 1.5961, 0.144, 0.0141] }] },
  "weekly": { "resin": 60, "discountResin": 30, "discounts": 3, "solvent": 0.33, "sources": [],
              "byLevel": [{ "level": 90, "perRun": 2.1 }],
              "byWorldLevel": { "TailOfBoreas": [{ "wl": 8, "perRun": 2.4 }] } },
  "leyLines": { "sources": [], "byWorldLevel": [{ "wl": 8, "exp": 122500, "mora": 60000 }] }
}
```

- `perRun` lists averages by material tier, lowest first (Teachings, Guide,
  Philosophies; 2- to 5-star weapon materials; Sliver to Gemstone). The wiki
  writes `1 + 61.85%` for "one, and a 61.85% chance of another": 1.6185.
- `tier` is the domain level (1 = I); `level` the weekly boss level; `wl` the
  World Level. `byWorldLevel` under `weekly` is for bosses outside domains,
  keyed by the lowest-id material of their trio.
- `firstRoll` is the wiki's "2-Star Roll" mean (Loot System/Material Drop
  Distribution). The game's own reward preview shows exactly that number, so
  the build compares the two and warns when they differ: the rates changed.
- Every section's `sources` names entries of `sources`, each with the page,
  a permalink with `oldid`, the revision id and the date read.

To update after a patch: run the build and read its warnings (a first roll
that no longer matches the game, a tier or boss level without a rate). Open
each source's page, compare its current revision with `revid`, copy the new
averages, set `revid`, `url` and `read`, and rebuild. The MediaWiki API gives
the raw tables:
`https://genshin-impact.fandom.com/api.php?action=parse&page=<Page>&prop=wikitext|revid&format=json`.
The parser is `src/drops.ts`; the build checks the file with it
(`scripts/lib/drops.ts`) and fails on anything malformed.
