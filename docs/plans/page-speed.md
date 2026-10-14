# Page load speed — analysis and plan (2026-10-15)

Status: **analysis only, nothing changed.** Measured on the live site (owner's
account, warm cache) and on the production build served locally (`vite preview`,
the QA account with a real-size capture, Chrome with the CPU slowed 4× like a
mid-range phone). Live build at the time: `09d8e05`.

## 1. Measurements

### 1.1 Live site, Overview, owner's account (cache warm, service worker active)

| | ms |
|---|---|
| HTML (TTFB) | 222 |
| DOMContentLoaded | 324 |
| script files loaded | **156** (all from the service worker's cache), last at 1,138 |
| `/api/auth/me` | starts 322, TTFB 258 |
| `/api/accounts` | starts **588** (after `me`), TTFB 133 |
| `/api/accounts/11`, `/settings`, `/snapshots` | start **827** (after `accounts`), TTFB 134–340 |
| `/api/accounts/11/bundle`, `/catalog` | start **897**, TTFB ~150 (bundle 16 KB, catalog 244 KB) |
| data complete | **≈ 1,050** |

Four request rounds run one after another; each costs one 130–340 ms trip
(Smart Placement runs the Worker next to the database, so every call is
browser → edge → Worker near D1 → D1).

### 1.2 Production build, local, CPU 4× slower (no network delay)

| page | first paint | largest paint | main thread blocked (long tasks) | biggest single task | JS |
|---|---|---|---|---|---|
| Overview, empty cache | 764 | 764 | 601 ms | 251 ms | 153 files, 1.8 MB |
| Overview, warm | 716 | 940 | 553 ms | 207 ms | 153 files |
| Characters | 484 | **3,844** | 897 ms | **508 ms** | 99 files |
| Artifacts | 408 | 1,320 | **1,137 ms** | 285 ms | 103 files |
| Materials | 616 | 1,120 | 880 ms | 378 ms | 144 files, **2.5 MB** |
| Planner | 392 | 1,336 | 807 ms | **525 ms** | 121 files |
| Wishes | 364 | 452 | 208 ms | 97 ms | 154 files |

(ms. A "long task" blocks the page ≥ 50 ms: input and scrolling freeze meanwhile.)

### 1.3 Build output (`vite build`)

- **227 chunks, 5.3 MB** raw. Startup (`index.html`): **37 files, 593 KB raw / 186 KB gzip**.
- The biggest startup file is `src-*.js`, **271 KB raw / 88 KB gzip: the whole
  `@gdt/shared` barrel** (zod and every API schema, wish item tables, codecs) — loaded
  on every page although a page uses a little of it.
- Large lazy chunks: `materials-*` 326 KB (×2: material index + names), export worker
  323 KB, `planner` 228 KB, `PlannerView` 243 KB, material names per language 169–189 KB,
  achievement texts 160–185 KB, `CharacterModal` 179 KB, `materials-history` 171 KB.
- **~25 lucide icons are separate chunks** each (`chevron-left`, `gem`, `trophy`…):
  one request each at startup.
- `AccountLayout` prefetches **every** account page's chunk when idle (`prefetch()`),
  so Overview ends up loading ~153 files (1.8 MB) — free when cached, heavy on a first
  visit and after every deploy.

### 1.4 Database

`wrangler d1 insights` (7 days, by rows read): page-load queries take **1–6 ms**
each in D1 — the database is not the slow part. The top reader (1.03M rows of the
1.17M/day) is the **import** path (`json_each … CROSS JOIN artifacts`: ~1,950 rows
per import × 530 imports, from irminsul's frequent full re-uploads) — a cost problem,
not a page-load one (live sync, `live-sync.md`, removes most of those imports).

## 2. Causes, ranked by what the user feels

1. **The request waterfall (≈ 1 s on every load, more on mobile networks).**
   `me` → `accounts` → account + settings + snapshots → bundle + catalog, each round
   waiting for the previous. Startup data needs 4 sequential trips of 130–340 ms.
2. **Main-thread work on big pages (0.8–1.1 s blocked, single freezes of 0.5 s on a
   phone).** Decoding the bundle and the artifact catalog, building the roster /
   artifact rows / planner model, and rendering hundreds of cards — all on the main
   thread, all after the data arrives.
3. **Characters' largest paint at 3.8 s**: ~100 portraits + namecards from
   static.nanoka.cc load eagerly at once (eager on purpose, against scroll lag); on an
   empty cache the first screen waits for the whole wave.
4. **Too much JavaScript at startup and in prefetch.** 186 KB gzip before anything
   shows (88 KB of it the shared barrel), ~25 tiny icon requests, and an idle prefetch of
   every page (1.8–2.5 MB raw), including the biggest chunks.
5. **Cache churn on every deploy.** CI deploys every push (and game-data bumps); chunk
   names change with their content, and many change together (a shared module touched
   → its importers' hashes change), so after a deploy the service worker and the HTTP
   cache refetch much of the 1.8 MB.
6. **Per-request server overhead.** `/auth/me` (258 ms) and `/accounts/:id` (343 ms)
   are slower than the plain 130 ms trip: they run several D1 statements one after
   another instead of one `batch()`.

## 3. Plan

Each step is independent, measured with the same script before/after
(`scratchpad/qa-perf.mjs` pattern: puppeteer, CPU 4×, cold + warm, plus a live
waterfall read on the owner's account). Targets for a warm visit on a mid-range
phone: **first useful screen < 600 ms, no single task > 150 ms, Characters' largest
paint < 1.5 s.**

### Step 1 — Kill the waterfall (biggest win, small change)

- **One startup call**: `GET /api/bootstrap` → `{ me, accounts, settings }` (the user,
  the account list with each `dataVersion`, the user settings) in one Worker request
  with **one `d1.batch()`**. The app calls it once at boot instead of `me` then
  `accounts`. Old endpoints stay.
- **Start account data immediately**: the route already names the account
  (`/app/a/:id`); fetch `bundle` + `catalog` + `snapshots` for it **in parallel with
  bootstrap**, using the last known `dataVersion` from storage (see Step 2); if
  bootstrap says the version moved, refetch (rare).
- **Batch the slow routes**: `/auth/me`, `/accounts/:id` and the account settings
  route each become one `d1.batch()` (one round trip to D1 instead of 2–4).
- Expected: data at ~1 trip (~250 ms) instead of ~1,050 ms on the live numbers.

### Step 2 — Remember data between visits (instant repeat visits)

- Keep the decoded-ready **bundle and catalog in IndexedDB**, keyed by account +
  `dataVersion` (they are immutable per version). On load, render from IndexedDB at
  once, then check the version from bootstrap; only a new capture downloads again.
- Same for the account list/settings (stale-while-revalidate: show, then refresh).
- Budget: one account's bundle+catalog is a few hundred KB; keep the newest version per
  account, evict older ones.
- Expected: repeat visits show real data in < 300 ms, before any network answer.

### Step 3 — Move heavy work off the main thread

- **Decode in a Web Worker**: bundle and catalog decoding (and the "now" journal apply
  from live sync) run in a worker (the export worker already decodes bundles there);
  the page gets plain objects back.
- **Cache derived views per `dataVersion`**: the roster (`buildRoster`), armory, artifact
  rows and the planner model are rebuilt on every visit and on locale switches; memoize
  them per version (and per language where names enter), in memory and optionally in
  IndexedDB.
- **Render less at once**: Artifacts (thousands of cards) and the Characters roster render
  in slices (`use-progressive` exists — apply it to every long list), or virtualize the
  artifact grid (only cards near the viewport exist in the DOM).
- **Split long tasks**: where a computation must stay on the main thread, yield between
  chunks (`scheduler.yield()` / `setTimeout(0)` every ~30 ms of work).
- Expected: no task > 150 ms; Artifacts/Planner blocked time cut by more than half.

### Step 4 — Images on Characters (and every grid)

- First screen only: the first ~12–18 portraits/namecards `fetchpriority="high"` and
  eager; the rest `loading="lazy"` with a fixed size (no layout shift). Keep the
  blurred-namecard look (no `backdrop-blur`, per the earlier "insane lag" rule).
- `<link rel="preload">` the first row's images once the roster is known.
- Check image sizes: serve the smallest size the tile needs (namecards are wide
  images shown small).
- Expected: largest paint < 1.5 s on an empty cache.

### Step 5 — Less JavaScript up front

- **Split the shared barrel**: `@gdt/shared` gets `"sideEffects": false` and subpath
  exports (`@gdt/shared/api`, `/codec`, `/wish`, `/staff`, `/notices`…); the app imports
  from subpaths. zod schemas stay out of the client's startup path (the client needs
  types, not validators, for most calls).
- **Icons in one chunk**: a `manualChunks` rule puts lucide icons used by the shell in
  one file (one request, not ~25).
- **Smarter prefetch**: prefetch only the pages next to the current one in the nav,
  on idle **after** the page settled, and prefetch on hover/focus of a nav link; never
  prefetch the heavy chunks (material names, achievement texts, export worker,
  CharacterModal) until their page opens. Respect `navigator.connection.saveData`.
- Expected: startup ~110–130 KB gzip instead of 186 KB; a first visit downloads
  ~0.5–0.8 MB instead of 1.8 MB.

### Step 6 — Stable caching across deploys

- **Vendor and data chunks with stable names**: `manualChunks` for `vue`/`vue-router`/
  `pinia`/`vue-i18n` (vendor), `@gdt/game-data` data files (change only with a data
  release) and `@gdt/shared` (change only when shared changes), so a UI-only deploy
  invalidates only the UI chunks it touched.
- The service worker precaches the startup set after a deploy in the background (it
  already handles updates with the "A new version is ready" banner).
- Expected: after a typical deploy, < 200 KB re-downloaded.

### Step 7 — Server details

- Return `Server-Timing` headers on API responses (D1 time, statements) so the
  waterfall shows where server time goes; add them to the staff "health" view.
- Re-check Smart Placement with numbers: with Step 1 (one call at startup) it is the
  right choice (one far trip, D1 next door); keep it unless the timings say otherwise.
- D1 read replication (Sessions API) is an option for read-only routes if users far
  from APAC appear; not needed for the current users.
- Import cost (§1.4): handled by live sync; meanwhile, the artifact identity lookup
  could check only identities not already in the account's newest catalog chunk.

## 4. Order and expected effect

| order | step | effort | effect |
|---|---|---|---|
| 1 | Waterfall → bootstrap + parallel data + batched routes | small | −700–800 ms every load |
| 2 | IndexedDB bundle/catalog | medium | repeat visits instant |
| 3 | Worker decode + memo + progressive lists | medium | no freezes; −0.5 s blocked on big pages |
| 4 | Image priority on grids | small | Characters LCP 3.8 s → < 1.5 s |
| 5 | Shared barrel split, icons chunk, smarter prefetch | medium | −60–70 KB gzip startup; −1 MB first visit |
| 6 | Stable chunks across deploys | small | far less re-download after deploys |
| 7 | Server-Timing, placement check | small | visibility |

Verification for every step: the perf script before/after (cold, warm, CPU 4×, 390 px
and 1366 px), the live waterfall on the owner's account, and the full CI gate. Layouts
must still survive real data (CLAUDE.md rule).
