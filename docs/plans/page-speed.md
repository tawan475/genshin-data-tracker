# Page load speed — analysis and plan (2026-10-15)

Status: **in progress** — shipped steps and their numbers are in §5. Analysis
measured on the live site (owner's account, warm cache) and on the production
build served locally (`vite preview`, the QA account with a real-size capture,
Chrome with the CPU slowed 4× like a mid-range phone). Live build at the time:
`09d8e05`.

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

## 5. Progress

Local A/B: `vite preview` of this branch vs the build before it, a synthetic
account at real scale (123 characters, 520 weapons, 2,300 artifacts, 460
materials, 60 captures; no real data), headless Chrome, 150 ms added latency.
CPU-4× numbers swing ±50% while the machine is busy, so the network-bound
steps are compared without CPU throttling.

- **Step 1 — shipped.** `GET /api/bootstrap?account=` (user + staff nodes +
  account list + its ETag + the opened account's settings, one `d1.batch`);
  `/auth/me` is one batch too. The session store adopts the user from it, the
  accounts store takes the list once. Account settings are one shared cache
  (`src/data/account-settings.ts`; seeded by the bootstrap, dropped on the
  live `planner` event, kept from a save) instead of up to three reads per page.
  Opening the app starts the route's page chunks and, on an account page this
  device has seen (`account-hint:<id>` in localStorage: last data version +
  newest capture), the page's data loads (`src/data/boot-prefetch.ts`) beside
  the bootstrap. Overview skips its account re-read when the list is < 30 s old.
  Requests before data on Characters: `me → accounts → settings+bundle+catalog`
  (3 rounds) → `bootstrap ‖ bundle+catalog` (1 round).

  | 1366 px, CPU 1×, +150 ms | before | after |
  |---|---|---|
  | Characters: data complete | 877–1,032 | 370–482 |
  | Characters: largest paint | 1,964–2,216 | 1,764–1,960 |
  | Artifacts: largest paint | 1,060–1,312 | 648–692 |
  | Planner: largest paint | 960–1,472 | 708–1,328 |
  | API requests, Characters | 5 | 3 |
- **Step 2 — shipped.** Bundles, the catalog and the snapshot list are kept
  in IndexedDB (`src/data/idb-cache.ts`, db `gdt-data`) as downloaded (bytes /
  JSON text), keyed by account + kind and stored under the data version the
  response's ETag names (never the one asked for); a put drops the account's
  older versions and skips one older than what is kept. The last bootstrap's
  user + account list is kept in localStorage (`stores/boot-cache.ts`): a
  repeat visit adopts it at once and renders from IndexedDB, then takes the
  bootstrap's answer (a moved version reloads that page's data; a refused
  refresh signs out as before). Staff Inspect reads are never stored. Signing
  out, or a different user signing in, clears both. Repeat visit, requests:
  `bootstrap` only (Characters, Overview, Planner's own routes aside).

  | 1366 px, CPU 1×, +150 ms, repeat visit | step 1 | step 2 |
  |---|---|---|
  | Overview: first paint | 948–1,032 | 712–1,004 |
  | Characters: first paint | 432–524 | 256–360 |
  | Artifacts: largest paint | 648–692 | 540–616 |
  | Planner: largest paint | 708–1,328 | 496–828 |
- **Step 3 — shipped.** Profiling showed decoding is the small part (10–35 ms
  per page unthrottled); mounting and laying out big pages is the rest. So:
  bundles ≥ 16 KB decode in a Web Worker (`src/workers/decode.worker.ts`, 23 KB,
  imports `@gdt/shared/codec/bundle` only; main-thread fallback); the catalog's
  rows, the snapshot decode, the artifact rows (`withArtifactRows`) and the
  render of what loaded (`useResource`) each get a task of their own
  (`lib/yield.ts`: `scheduler.yield()` or a zero timeout); Chart.js charts draw
  after the page's first paint (`lib/after-paint.ts`: measuring the canvas
  during mount forced a layout of the whole page); the Characters roster mounts
  12 cards per frame (`useProgressive`) with `content-visibility: auto` per card
  (padding keeps the focus ring inside its paint box); the Materials bag mounts
  36 tiles per frame; the theme isn't re-applied when unchanged (a forced style
  pass of the whole page on every session answer). Memoizing derived views
  needed nothing new: rows and inventories are already cached per inventory.

  | 390 px, CPU 4×, warm: biggest task (ms) | step 2 | step 3 |
  |---|---|---|
  | Overview | 370–499 | 183–184 |
  | Characters | 1,157–1,497 | 223–319 |
  | Artifacts | 561–694 | 366–368 |
  | Materials | 1,266–1,522 | 513–643 |
  | Planner | 316–750 | 252–399 |
  | Characters, largest paint | 3,124–4,136 | 2,312–2,820 |
  | Materials, largest paint | 2,264–2,708 | 1,516–1,840 |

  Left above 150 ms: the first render of a page shell + toolbar (Layout 50–130
  ms of it), module evaluation at startup (80–100 ms, Step 5), the idle
  prefetch of every page's code (~100 ms, Step 5), vue-i18n compiling messages
  on first use (they are not precompiled at build time).
- **Step 4 — shipped.** The Characters LCP was the first namecard, and it
  waited on script twice: it faded in only after its `load` handler ran (behind
  the roster's mount tasks, up to a second), and the roster's ~360 eager images
  all fetched at one priority. Now the first 12 cards' pictures are
  `fetchpriority="high"` and show as soon as they decode (no script gate), the
  rest `low` (still eager: the roster doesn't pop in on scroll). The Weapons,
  Artifacts and Materials bags load their first 30 tiles eager + high
  (`lib/first-screen.ts`; the rest stay lazy). Image sizes: nanoka serves one
  size per picture, so nothing smaller to ask for; left as is.

  | 1366 px, CPU 4×: Characters largest paint | step 3 | step 4 |
  |---|---|---|
  | empty cache (images from nanoka) | 2,984–3,072 | 1,352–1,440 |
  | warm | 4,596–4,796 (step 2 build) | 1,740–1,924 |
  | Materials, warm | 2,148–2,404 (step 2 build) | 1,576–1,604 |
- **Step 5 — shipped.** Startup now imports nothing from the `@gdt/shared`
  index: the few values it needs come from zod-free subpaths
  (`@gdt/shared/permissions`, `/oauth`, `/settings`; the package has
  `"sideEffects": false`; `staff.ts`/`api.ts` re-export them, so the index is
  unchanged). One `vendor` chunk (Vue, router, Pinia, vue-i18n) and one `icons`
  chunk (every lucide icon, 11 KB gzip) replace ~20 tiny files
  (`vite.config.ts` `codeSplitting.groups`, client only). AccountLayout's idle
  prefetch loads only the pages next to the current one in the navigation (and
  the newest capture), never on Save-Data; any in-app link loads its page's
  code on hover, focus or touch (`router/prefetch.ts`). The service worker
  precaches the shell + startup set only (other chunks are cached when used),
  so a first visit no longer downloads every page.

  | | step 4 | step 5 |
  |---|---|---|
  | startup (index.html) | 40 files, 198 KB gzip | 25 files, 150 KB gzip (127 KB JS) |
  | first visit to Overview, all downloads incl. service worker | 235 files, 1,640 KB gzip | 72 files, 378 KB gzip |
  | Overview cold, 390 px, CPU 4×, +150 ms: first paint | 3,400–3,440 | 2,408–2,412 |
  | … data complete | 4,051–4,124 | 2,694–2,762 |
  | … main thread blocked | 1,267–1,272 | 567–668 |

  The biggest startup piece left is vue-i18n with its message compiler and the
  English messages (32 KB gzip): precompiling messages at build time would drop
  the compiler (a tooling change, not done).
- **Step 6 — shipped.** Two causes of re-downloads after a deploy, both fixed:
  1. *Renaming cascades.* Pages imported the app's stores and helpers from the
     entry chunk, which also holds the router's lazy import of every page: a
     page's new file name renamed the entry, so every page importing from it
     was renamed too. Now a `startup-graph` build plugin finds the app's own
     startup modules (static imports from `main.ts`, minus `main.ts` and
     `router/index.ts`) and an `app` chunk group holds them (`vite.config.ts`;
     styles stay with the entry, since the Tailwind sheet changes with any new
     class); `vendor` and `icons` (Step 5) are stable too. The one module
     outside the router that needed it reads it from `router/instance.ts`.
     Startup is 5 files now (vendor, app, icons, entry, CSS; 146 KB gzip).
  2. *The service worker's per-build cache.* Each deploy's worker deleted the
     old cache and fetched everything again. Hashed files now live in one
     `gdt-assets` cache across builds: install fetches only the startup files
     not already held, activate drops files the new build no longer has
     (`ignoreVary`: a hashed name is its content). The shell stays per build.
  A shared-package chunk group was tried and dropped: one 110 KB-gzip chunk at
  startup (its zod-free modules are startup code) for no gain, as its modules
  are leaves whose names already change only with their content.

  | after a deploy that changed one page | step 5 | step 6 |
  |---|---|---|
  | files renamed (of 164) | 60 | 3 (the page, a chunk it shares code with, the entry) |
  | … a new CSS class in a card component | 96 | 4 (the same + the CSS) |
  | a returning visitor downloads (Overview, Characters, Artifacts) | 43 files, 234 KB gzip | 2 files, 15 KB gzip |
