# Game events, automatic (plan, 2026-10-15)

The user's goal: the planner knows what is running in the game without anyone
typing dates — the "all domains open" week in the Farm view, and every live
event as an item of Tasks → Events, the way Seelie lists them. Events come
from the tracker (never from irminsul's captures).

## What is known

- The game data (Dimbreath's dump) defines the events (`OpActivityExcelConfigData`:
  Overflowing Abundance = OpActivity 601/602, Favor 501/502 …) but holds no
  dates: the server alone schedules them.
- **The game's own notice board** is public and per server:
  `https://sg-hk4e-api.hoyoverse.com/common/hk4e_global/announcement/api/getAnnList`
  and `…/getAnnContent` with `game=hk4e&game_biz=hk4e_global&bundle_id=hk4e_global&platform=pc`,
  `region=os_asia|os_usa|os_euro|os_cht`, `lang=en|zh-cn|zh-tw`, `level=55&uid=100000000`.
  ~35 notices; the list gives `type_label` (Game / Event / Miliastra Wonderland),
  title, `start_time`/`end_time` (when the *notice* shows, not the event — unusable
  as event dates); the content's text states the event's dates in server time:
  - `2026/09/30 10:00 - 2026/11/03 03:59` (dash `-`, `–`, `—`, `~`; `Event Duration:` or bare)
  - `After the Version 7.1 update – 2026/11/02 03:59` (start = the version's update time)
  - `Permanently available after the Version 7.1 update`, `Available throughout the entirety of Version 7.1`,
    `2026/09/28 00:00 until the end of Version 7.1`
  - the version's update time is written in the top-up reset notice:
    `Version 7.1 Update Time: 2026/09/23 06:00` (UTC+8, the same instant worldwide)
  - Event Wish notices: `2026/10/13 18:00 – 2026/11/03 14:59` (phase II); phase I is
    `After the Version X update – …`.
- **No Overflowing event is on the notice board.** HoYoLAB's official Genshin account
  (uid 1015537) posts each run ~2 days ahead, the dates in the text
  (`〓Event Duration〓 2026/09/14 04:00 - 2026/09/21 03:59`); public search API:
  `https://bbs-api-os.hoyolab.com/community/search/wapi/search/post?keyword=Overflowing&gids=2&size=20`.
  The last Abundance post is September's; the run now (7.1 phase II) was never announced.
- **The user's rule (2026-10-14):** every new banner phase opens every talent book and
  weapon material domain for 7 days ("always happening now, after a new banner drop").
  Window = the banner phase's start → 04:00 seven days later (Oct 13 18:00 → Oct 20 04:00).

## Design

1. **Pure parsers** (`packages/shared/src/notices/`, tested with synthetic text in every
   format above, zh-CN/zh-TW included):
   - `noticeWindow(text, version)` → `{ start, end, open }` in server local time
     (`YYYY-MM-DDTHH:mm`), `open` for "permanently"/"until the end of Version" (end = the
     version's end); null when no date is found.
   - `versionUpdateTime(text)` from the top-up notice; the version's end = the latest end
     among its notices (the next update).
   - `noticeKind(listItem, title)`: `wish` (title starts "Event Wish"), `event` (type Event),
     else skipped (Game news, Miliastra Wonderland, permanent links).
   - `overflowingPost(subject, content)` → domain event kind + window from HoYoLAB posts.
   - `bannerAbundance(wishWindows)` → one `abundance` window per distinct banner phase start
     (the user's rule); a HoYoLAB Abundance post overlapping it wins.
2. **Storage** (migration 0025): `game_notices` (server, ann_id, kind, start_at, end_at as
   server-local strings, `open_ended`, titles JSON per language, image, first/last seen,
   source `board|hoyolab`), PK (server, source, ann_id). Sync state in `site_settings`
   `events.sync` ({ at, ok, counts, unparsed: [ann ids], error }).
3. **Hourly cron** (wrangler `crons` gains `"7 * * * *"`; `scheduled()` branches on
   `controller.cron`, the daily maintenance unchanged): per server one list + three content
   calls (en, zh-cn, zh-tw: titles in the user's language), plus one HoYoLAB search; at most
   ~20 requests an hour, each with a timeout. A failed fetch keeps what is stored (never
   deletes); a notice gone from the board stays until its end. Everything in one D1 batch.
4. **API**: `GET /api/game-events?server=ASIA` → `{ domain: DomainEventWindow[], notices:
   GameNotice[] }` (running or starting within 14 days), merged on the server: game data's
   domain list ∪ staff windows ∪ HoYoLAB Overflowing posts ∪ banner Abundance; cached 5 min.
   `GET /api/domain-events` stays (old app builds) and returns the same merged domain list.
5. **App**: the planner reads `/api/game-events` for the account's server. Tasks → Events
   lists domain events (daily, as now) and the notices (one-time: done until the notice
   ends; title in the language on screen; wishes left out — the Wishes page has them).
   The Farm view keeps following `domainDay`.
6. **Staff**: Overview → Site shows the last sync (when, counts, notices whose dates did not
   parse) and a "Sync now" button (`POST /api/staff/events/sync`, `site.settings`, audited).
   Staff domain windows stay as the manual override.
7. **AI fallback (not now)**: notices whose text no rule parses are listed for staff. If
   that list keeps growing, a Claude Haiku call in the cron (secret `ANTHROPIC_API_KEY`,
   off without it) extracts `{start, end}` from those few texts only.

## Risks

- Undocumented APIs: they may change or refuse Cloudflare's addresses. The cron keeps the
  last good data, the staff page says when a sync failed, staff windows still work.
- The banner rule is the user's observation, not a game rule; if a phase passes without
  the all-open week, staff can delete the derived window (stored like a staff override:
  a staff entry `{kind: 'none'}` for that start, or simply a toggle per phase).

## Order of work

1. Parsers + tests. 2. Migration, cron, sync, store (+ worker tests with mocked fetch).
3. `/api/game-events` + merge. 4. App: Events tab with notices. 5. Staff sync status.
6. Full gate, local QA against the live board, deploy, check the first cron run.
