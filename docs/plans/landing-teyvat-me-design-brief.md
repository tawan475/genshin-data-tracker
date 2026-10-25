# Claude Design brief: the teyvat.me landing page

Paste everything below the line into a new Claude Design session.

---

Design the landing page for **teyvat.me**: one brand for two free tools for Genshin Impact players.

1. **The tracker** (the website at teyvat.me). Your Genshin account over time.
2. **The capture app** (a desktop program; Android is in progress). It reads your account while you play and sends it to the tracker.

The page has to sell both, and make clear that they work together: play the game, the app captures your account, and the tracker shows it.

## Brand and legal

- Name: **Teyvat.me** (written like that in titles). Domain teyvat.me.
- It is an unofficial fan project. The footer must say "Teyvat.me is an unofficial fan project and is not affiliated with or endorsed by HoYoverse. Genshin Impact is a trademark of HoYoverse." Use no HoYoverse logos and no Genshin Impact logo. Small in-game icons (character portraits, item icons) are fine, as the site uses them today. No splash art as the hero background.
- Make no safety promises about the game's terms ("100% safe", "ban-proof" and the like). Say what the app does and doesn't do (below) and leave it there.

## Look (use the existing design system)

Start from the Genshin Tracker Design System: https://claude.ai/artifact/XcdgwEXNFj73kmsGr2e4ug. Public pages are **dark glass over a soft hero background**, with an indigo accent, an amber "paimon" glow, the Outfit font, rounded glass panels, and floating UI cards as illustration. Stay inside it; this is not a new visual identity. The owner's taste is **minimal text**: labels, numbers, short lines, with details in tooltips or a FAQ, never paragraphs of marketing copy. Every string gets translated into 15 languages (en, zh-CN, zh-TW, ja, ko, es, fr, ru, th, vi, de, id, pt, it, tr), so keep headings short, leave room for longer German and Russian, and never bake text into images.

## Sections (suggested order; improve it if you see a better one)

1. **Hero.** Teyvat.me with one line covering both tools. Two actions: "Open the tracker" (or "Get started" when signed out, plus "Sign in") and "Download the app". Illustration: floating glass cards that look like the real app (a character card at Lv 90 · C2, an artifact with "CV 42.0", a wish pity counter, a progression sparkline).
2. **How it works.** Three steps: start the app → play Genshin → your account appears on teyvat.me, updated as you play.
3. **The tracker.** Feature tiles, one line each:
   - Snapshots over time: characters, weapons, artifacts (crit value, roll value), materials.
   - Progression charts (Mora, Primogems, artifacts) per snapshot or month.
   - Planner: level and talent goals, what to farm today by resin cost, daily and weekly tasks (commissions, Spiral Abyss, expeditions, Serenitea Pot currency, Welkin) read from your game.
   - Wish history: pity, 50/50, banner stats; import from paimon.moe or UIGF.
   - Achievements and Travel Accounts (anecdotes) checklists.
   - Share cards: a character build card, a whole-roster card, artifact cards (PNG).
   - Share an account with a friend (viewer or editor).
   - 15 languages, installable as an app, live updates across tabs.
4. **The capture app.** What it does: reads the game's own network traffic on your PC, decodes your account (characters, weapons, artifacts, materials, achievements, wishes) and uploads it to the tracker. You sign in once with your teyvat.me account. Live sync while you play. It never touches the game's files or memory and needs no mods. Start it before the game. Free and open source (MIT). Platform badges: Windows now, Android "in progress". The download button points at GitHub Releases. Show the app's window as a glass mock-up: a status like "Data decrypting", "Signed in as …", and an "Auto export to tracker" toggle.
5. **Privacy.** Short points: your data is yours, export it any time (GOOD format, works with Genshin Optimizer), delete your account any time, the app is open source.
6. **FAQ** (collapsible): Is it free? Does it modify the game? What does the app read? Do I need the app (no: you can import GOOD files by hand)? Which servers (all: America, Europe, Asia, TW/HK/MO)?
7. **Footer.** Links: Tracker, Download, GitHub, Discord, a language picker, and the disclaimer above.

## Rules

- Must work at 390 px, ~1366 px and ≥1920 px wide. No horizontal scroll on phones. Grids use `minmax(0, …)` / auto-fit, never content-sized tracks next to `1fr`.
- Dark only (public pages are always dark).
- Respect reduced motion: the floating cards stop.
- One primary button style (the glowing one) and one secondary (glass).
- Deliver the full page at desktop and phone width, plus a close-up of the hero and the capture-app section.
