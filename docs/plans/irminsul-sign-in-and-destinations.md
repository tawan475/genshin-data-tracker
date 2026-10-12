# irminsul: sign in with the tracker, choose where uploads go

Status: **proposed 2026-10-12.** Parts 1 and 2 are the work to do; Part 3 (a local API and a
local-only tracker) is written down as a proposal for later, not scheduled. The decisions at the
end still need the user's answer.

## Why

Today irminsul uploads with an import key the user copies from the tracker into irminsul's
settings. It works, but it is the one fiddly step in setting irminsul up, a key in a text box is
easy to leak, and nothing in the tracker shows which PCs are uploading. irminsul should simply
have a **Sign in** button.

Import keys stay: other developers can keep building importers on them, and released irminsul
builds keep calling `/genshin-accounts-public/import-by-key` and `verify-key`, which stay exactly
as they are (wire contract, see the workspace guide).

## Part 1 — Sign in (OAuth 2.0, authorization code + PKCE)

The standard flow for desktop apps (RFC 8252): irminsul is a public client (no secret is baked in),
proves itself with PKCE, and receives the answer on a loopback port.

1. **irminsul** picks a free port, starts listening on `127.0.0.1:<port>`, and opens the system
   browser at `<tracker>/link?client=irminsul&redirect=http://127.0.0.1:<port>/callback&state=<random>&challenge=<S256 of verifier>&device=<PC name>`.
2. **Tracker** (`/link`, an SPA page): the user signs in if needed (password, Discord or Google, the
   usual human check), then sees one consent screen:
   - "Irminsul on `<PC name>` wants to upload your Genshin data."
   - Where uploads go: **Auto: match the account by UID** (preselected; today's user-key behaviour,
     new UIDs create an account) or **Always this account** (a list of the user's accounts).
   - Allow / Cancel.
3. On Allow the tracker creates a one-time code (60 s, single use, bound to the challenge, the
   redirect and the user) and redirects to the loopback `callback?code=…&state=…`. irminsul checks
   `state`, then calls `POST /api/oauth/token` with the code and the PKCE verifier.
4. The token endpoint answers a **refresh token** (long-lived, rotated on every use) and a short
   **access token**. Both belong to a new `user_sessions` row with `method = 'irminsul'`, so the
   device shows up in **Settings → Devices** ("Irminsul on `<PC>`"): last seen, place, sign out,
   plus the upload target, which can be changed there later.
5. irminsul uploads with `Authorization: Bearer <access>` to a new route (e.g.
   `POST /api/irminsul/import`, same body as `import-by-key`), refreshing the access token when it
   expires. `GET /api/irminsul/whoami` replaces `verify-key` for signed-in clients (same answer
   shape, so the "Open dashboard" button keeps working).

Server side:

- Migration: `user_sessions.method` gains `'irminsul'`; new nullable columns on `user_sessions` for
  the grant (`client`, `upload_mode` 'uid' | 'account', `upload_account_id`), plus a small
  `oauth_codes` table (code hash, user, session, challenge, redirect, expiry). CREATE TABLE / ADD
  COLUMN only (the migrations test). Changing the `method` enum is a Drizzle type change only.
- Everything that guards keys guards these sessions too: suspended users and blocked uploads are
  refused (403 as today), `KEY_IMPORT_LIMITER` per session, the daily and total upload quotas,
  live notify after an upload.
- `revoke-others`, password change and `logout-all` end irminsul sessions like any other device
  (decide: see decisions).
- Redirect rule: only `http://127.0.0.1:<any port>/callback` and `http://localhost:<any port>/callback`
  (RFC 8252 loopback), nothing else.

irminsul side:

- Settings: one **Sign in** button (shows the account name and target once signed in; Sign out
  revokes the session server-side).
- The refresh token lives in the OS credential store (Windows Credential Manager, the macOS
  Keychain, Secret Service on Linux), never in `app.ron`.
- A saved import key keeps working until the user signs in (see decisions).
- irminsul runs elevated on Windows. A browser opened from an elevated process can start as a
  separate, signed-out instance. Test it early; the fallback is the **device code** flow below.

### Fallback: device code (RFC 8628)

irminsul shows "Open `<tracker>/link` and enter **ABCD-EFGH**", polls `POST /api/oauth/token`
with the device code, and the user approves on any device (also a phone). Same consent screen,
same session row. Built second, only if the loopback flow proves unreliable.

## Part 2 — Where uploads go

- irminsul keeps the tracker address editable (`SavedAppState.tracker_api_url`, already there),
  but **a sign-in belongs to one address**: changing it signs out of the old one, and a token is
  never sent to any other host.
- Changing the address asks first: "Uploads will now go to `<host>`. Continue?" Every upload holds
  the whole account, so a pasted lookalike URL must not slip through quietly.
- Optional later: more than one destination (e.g. the hosted tracker and a self-hosted one), each
  with its own sign-in or import key.

## Part 3 — Later (proposal, not scheduled): local API and a local-only tracker

For people who don't want any server: a browser page pulls from irminsul.

- **irminsul local API:** off by default (a setting), listens on `127.0.0.1` only, read-only:
  `GET /v1/status`, `GET /v1/export` (the same JSON as an upload), an event stream that says "new
  data". Never settings, never wish keys (irminsul runs elevated: keep the surface tiny).
- **Who may call it:** any site the user visits could try `127.0.0.1`, so the first request from an
  `Origin` asks in irminsul ("Allow `<site>` to read your Genshin data?") and the answer is
  remembered per origin; browsers cannot fake `Origin`. Also check the `Host` header (DNS
  rebinding) and answer CORS and Chrome's local-network-access preflight only for allowed origins.
  A public site reaching `localhost` triggers Chrome's own permission prompt; a page served from
  `localhost` avoids it.
- **Local-only tracker:** the same Vue app storing snapshots in the browser (IndexedDB) and pulling
  from the local API. `packages/shared` (the storage codec) already runs in the browser, so this is
  feasible, but it is its own project: storage, import, export and every page that reads the API
  today would need a local data source.

Order if it is picked up: the local API first (small, useful to other tools on its own), then the
local-only tracker.

## Decisions (user)

1. Loopback browser sign-in first, device code only as a fallback? (Recommended.)
2. Keep a saved import key working until the user signs in, and keep key entry under "Advanced" in
   irminsul for a release or two? (Recommended, or updates silently stop uploads.)
3. Refresh token in the OS credential store? (Recommended.)
4. Consent screen preselects **Auto by UID**? (Recommended.)
5. Do "Sign out other devices" and a password change also sign irminsul out? (Recommended yes:
   it is a device like any other; irminsul then shows "Signed out, sign in again".)

## Phases

1. Tracker: migration, `/link` consent page, code + token endpoints, Bearer upload and whoami
   routes, Devices panel entries; tests (code reuse, PKCE mismatch, wrong redirect, revoked
   session, quotas, suspended user).
2. irminsul: loopback sign-in, credential store, refresh, Bearer upload, Settings UI, sign out;
   keep the key path.
3. Destinations: confirm-on-change, sign-in per address.
4. Device-code fallback, if needed.
