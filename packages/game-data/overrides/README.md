# overrides

Hand-kept inputs to `pnpm --filter @gdt/game-data build` (and `icons`). The
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

The build fails for a family without days and suggests the days it reads from
the game's own domain reward list (`DungeonEntry`); check them in game. It
warns when an entry here disagrees with that list or matches no family.

## achievement-versions.json

The version each achievement was added in, as `{ "4.2": [ids…] }`. The game
data has no such field. It was seeded once from stardb.gg with
`pnpm --filter @gdt/game-data seed-achievement-versions`. After that the build
keeps the version an achievement was first compiled with and gives new ones the
dump's game version, so this file only needs an edit to correct a version:
move the id to the right list.

## keys.json

GOOD key fixes and exclusions, by game id (the ids in the dump's Excel files).

| Section              | What                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `characters.exclude` | `{ "<avatar id>": "why" }`: avatars that pass the playable filter but are not real characters (placeholders)                                                                                      |
| `characters.key`     | `{ "<avatar id>": "GoodKey" }`: when irminsul's key differs from the name's `toGoodKey`                                                                                                           |
| `weapons.include`    | `{ "<weapon id>": "why" }`: weapons without a lore entry that are still owned (quest weapons); weapons without one are skipped by default                                                         |
| `weapons.exclude`    | `{ "<weapon id>": "why" }`: weapons to leave out                                                                                                                                                  |
| `weapons.key`        | `{ "<weapon id>": "GoodKey" }`                                                                                                                                                                    |
| `materials.key`      | `{ "<item id>": "GoodKey" }`                                                                                                                                                                      |
| `materials.prefer`   | `{ "GoodKey": <item id> }`: which item stands for a key several items share (for its icon and item id)                                                                                            |
| `removed`            | `{ "achievements": [ids], "goals": [ids], "characters": [keys], "weapons": [keys] }`: entries the game really removed. Without this the build fails, because stored marks and goals point at them |

Write the reason in the value: the next maintainer will want to know.

## drops.json

Placeholder for the planner's run, resin and day estimates (Phase 5):
approximate drops per run of each domain and boss. It is community data, so it
is hand-kept and shown as an estimate. The build only checks that it is a JSON
object for now; the format is defined with the planner estimates, likely
`{ "<family or material GOOD key>": { "perRun": 2.2, "resin": 20 } }`.

## icons/

Images for icons no source has, or to replace a bad one: `icons/<icon name>.png`
(or `.webp`, `.jpg`), e.g. `icons/UI_ItemIcon_100004.png`. They win over every
source. Then run `pnpm --filter @gdt/game-data icons`. The icon names to use are
in the `icons` report and in `data/icons.json` `missing`.
