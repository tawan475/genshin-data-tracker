# Miliastra Wonderland cosmetics (shelved)

Status: **shelved** (user, 2026-10-27: no plan to add it soon; keep the plan for later). Nothing of it is in the app.

## What exists today

- Teyvat.me Capture (1.9.0+) sends `gi_miliastra.cosmetics`: cosmetic id → when obtained (unix s, 0 when the game sent no time). The tracker stores it in the `extras` section (part `m`, migration 0034) and decodes it like any other part: stored formats must decode forever, so this stays.
- Game notices of type "Miliastra Wonderland" are left out of the event list (`packages/shared/src/notices.ts`).
- No page, card or hub figure reads it.

## What was designed

Design pick **4B** on the A/B canvas https://claude.ai/artifact/J5cp3RxKRBaotBFYhVVznG (board `Miliastra-B.dc.html`): a Collections page "Miliastra Wonderland" with four tiles (Cosmetics, Outfits, Newest, This month), slot-group filter chips, and a timeline, one row per month (newest first: the month and "N new" on the left, a grid of the month's cosmetics with icon, name and day on the right). Time 0 goes in a last "Date unknown" group.

## What it needs first

1. **Names in the game data.** The table is `ExcelBinOutput/BeyondCostumeExcelConfigData.json` (2,757 rows at 7.1; Dimbreath's 7.1 dump has it). `costumeId` (260001…) is the id Capture sends; `nameTextMapHash`, `sortId`; obfuscated fields hold the quality colour (Orange 5★, Purple 4★, Blue 3★, Green 2★), the source (GachaPaid, Shop, BP, GachaFree, CreateAvatar) and the body slots (a list of `{<field>: ["UpperCloth", …]}`), so they must be found by their values.
   - genshin-game-data builds from client data sets decoded from the installed game (`client/`), which do not decode this table yet: the decoder has to learn it first (`client/find_*.py`, value-guided reader search), then a new client data set is published.
   - A compile patch adding section `cosmetics` (columns rarity, slots, source, order; text name) and topic `miliastra` is kept at `E:\gdt-playground\refs\miliastra-cosmetics-gamedata.patch`.
2. **Icons.** No costumeId → icon mapping is known. Extracted `UI_Beyd_Avatar_*` art is in `E:/gdt-playground/assets/images/miliastra`; the mapping may be in a hash field or the `BeyondIcon*` tables. Without it the page shows names only.

## Tracker work then

- Collections tab: `components/collections/tabs.ts` (slug, label, part, topic `miliastra`), the router's tab pattern, a hub figure in `data/collection-summary.ts`, a `miliastra` part in `data/collection-parts.ts` from `decodeExtras(...).miliastra`.
- All 15 locales, game terms from `E:/gdt-playground/i18n-glossary` (zh "千星奇域", ja "星々の幻境", en "Miliastra Wonderland").
- QA at 390 / 1366 / 1920 px with ~200 synthetic cosmetics over a year.
- Ship like any game-data batch: push game data, wait for its tag, pin it in the tracker, push the tracker at once.
