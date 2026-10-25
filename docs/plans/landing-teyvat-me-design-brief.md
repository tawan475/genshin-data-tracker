# Claude Design brief: the teyvat.me landing page

Paste everything below the line into a new Claude Design session.

---

Design the landing page for **teyvat.me**: one brand for two free tools for Genshin Impact players. The page serves three things: **the tracker**, **the capture app**, and **a video demo** that shows both working together.

1. **The tracker** (the website at teyvat.me). Your Genshin account over time.
2. **The capture app** (a desktop program for Windows, Linux and macOS; Android is in progress). It captures your account when you log in and exports it as GOOD JSON, for the tracker, Genshin Optimizer or any site that reads GOOD. No account needed; connecting it to teyvat.me is optional.

The page has to sell both, and make clear that they work together: play the game, the app captures your account, and the tracker shows it. The video demo is the proof of that loop.

## Several designs to compare (A/B)

Make **three distinct directions** on one canvas, each as a full page at desktop (1440) and phone (390) width, so the owner can pick one or A/B test them. Same content and rules in all three; they differ in layout and emphasis, not brand:

- **A · Two products.** The hero names Teyvat.me, then two equal panels side by side (Tracker | Capture app), each with its own button; the video sits right under them.
- **B · Video first.** The demo video is the hero (large player, poster frame, one line, two buttons under it); the tracker and app sections follow.
- **C · The loop.** One scroll story: Play → Capture → Track, each step a section with its own glass mock-up; the video closes the story before the FAQ.

Title each row on the canvas (A, B, C). Keep the shared pieces (buttons, cards, footer) identical across them so the comparison is about layout only. Then a fourth row with the hero close-ups of all three side by side.

## Brand and legal

- Name: **Teyvat.me** (written like that in titles). Domain teyvat.me.
- It is an unofficial fan project. The footer must say "Teyvat.me is an unofficial fan project and is not affiliated with or endorsed by HoYoverse. Genshin Impact is a trademark of HoYoverse." Use no HoYoverse logos and no Genshin Impact logo. Small in-game icons (character portraits, item icons) are fine, as the site uses them today. No splash art as the hero background.
- Make no safety promises about the game's terms ("100% safe", "ban-proof" and the like). Say what the app does and doesn't do (below) and leave it there.

## Look (the new Teyvat.me theme)

Use the new Teyvat.me look from the capture app's redesign canvases: **Teyvat.me Capture Desktop** https://claude.ai/artifact/AyH5FeBxvPzMGTdb9jyC7z and **Teyvat.me Capture Android** https://claude.ai/artifact/L8czy3JZb4nxHL9Vo9zXie. Read their artboards and match their colours, type, radii and surfaces, so the landing page, the tracker and the app read as one brand. Their tokens come from the Genshin Tracker Design System (https://claude.ai/artifact/XcdgwEXNFj73kmsGr2e4ug); install that system on the canvas for the token names, and where the capture canvases differ from it, the capture canvases win. Keep what the public pages already do: dark, glass panels, floating UI cards as illustration. The owner's taste is **minimal text**: labels, numbers, short lines, with details in tooltips or a FAQ, never paragraphs of marketing copy. Every string gets translated into 15 languages (en, zh-CN, zh-TW, ja, ko, es, fr, ru, th, vi, de, id, pt, it, tr), so keep headings short, leave room for longer German and Russian, and never bake text into images.

## Sections (suggested order; improve it if you see a better one)

1. **Hero.** Teyvat.me with one line covering both tools. Two actions: "Open the tracker" (or "Get started" when signed out, plus "Sign in") and "Download the app". Illustration: floating glass cards that look like the real app (a character card at Lv 90 · C2, an artifact with "CV 42.0", a wish pity counter, a progression sparkline).
2. **How it works.** Three steps: start the app → log in to Genshin → your account is exported. Connect the app to teyvat.me (optional) and it appears there, updated each time you log in.
3. **The tracker.** Feature tiles, one line each:
   - Snapshots over time: characters, weapons, artifacts (crit value, roll value), materials.
   - Progression charts (Mora, Primogems, artifacts) per snapshot or month.
   - Planner: level and talent goals, what to farm today by resin cost, daily and weekly tasks (commissions, Spiral Abyss, expeditions, Serenitea Pot currency, Welkin) read from your game.
   - Wish history: pity, 50/50, banner stats; import from paimon.moe or UIGF.
   - Achievements and Travel Accounts (anecdotes) checklists.
   - Share cards: a character build card, a whole-roster card, artifact cards (PNG).
   - Share an account with a friend (viewer or editor).
   - 15 languages, installable as an app, live updates across tabs.
4. **Video demo.** One player, about 60–90 s: the app capturing at login, then the same account appearing on the tracker. There is no video yet: design the slot with a poster frame (a still built from the mock-ups), a play button, its length ("1:20" placeholder) and chapter chips (Capture · Tracker · Planner · Wishes) that jump in the video. It loads nothing until played (self-hosted MP4/WebM or a YouTube embed, decided later), has captions, and on phones plays inline at 16:9 full width. Placement follows the direction (A/B/C above).
5. **The capture app.** What it does: reads the game's own network traffic on your computer, decodes your account (characters, weapons, artifacts, materials, achievements, wishes) and exports it as GOOD JSON, for Genshin Optimizer and any site that reads GOOD. **It works without an account: capture first.** Connecting it to teyvat.me (sign in once, then it uploads each time you log in) is the best way to use it with the tracker, but always optional (live sync while you play is coming; don't headline it). It never touches the game's files or memory and needs no mods. One honest line: start it before the game (it can't read a session it didn't see begin), and on Windows it asks for administrator rights, because packet capture needs them. Platform badges, Windows first (the main, best-tested one): "Windows · Linux · macOS", plus Android "in progress". The download button says "GitHub Releases" and its link must be easy to swap: for now it points at https://github.com/tawan475/irminsul/releases/latest (the same app under its old name; it updates itself to Teyvat.me later). Don't write "open source" on the app yet; that waits for its repo going public. A glass mock-up of the app's window is a mood piece (the desktop UI is being redesigned). Use today's real labels: "Data decrypting", "Signed in as …" and an "Auto export to tracker" toggle.
6. **Privacy.** Short points: your data is yours, export it any time (GOOD format, works with Genshin Optimizer), delete your account any time.
7. **FAQ** (collapsible): Is it free? Does it modify the game? What does the app read? Why does it need administrator rights on Windows? Do I need the app (no: you can import GOOD files by hand)? Which servers (all: America, Europe, Asia, TW/HK/MO)?
8. **Footer.** Links: Tracker, Download, GitHub, Discord, a language picker, and the disclaimer above.

## Rules

- Must work at 390 px, ~1366 px and ≥1920 px wide. No horizontal scroll on phones. Grids use `minmax(0, …)` / auto-fit, never content-sized tracks next to `1fr`.
- Dark only (public pages are always dark).
- Respect reduced motion: the floating cards stop and the video never autoplays (it never autoplays with sound anyway).
- One primary button style (the glowing one) and one secondary (glass).
- Deliver directions A, B and C as full pages at desktop and phone width, plus the hero close-ups row (see "Several designs to compare").
