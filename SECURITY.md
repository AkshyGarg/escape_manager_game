# Escape the Manager: security review and protection guide

Reviewed: October 2026. Scope: the full game (one HTML file), its leaderboard and
live-player features, third-party libraries, and how it is published on GitHub Pages.

## The honest limit first

A browser game has to send its code to every player's browser to run. Anyone
determined can always save that code. No tool can make browser code impossible
to copy. What protection can do is make copying, reading and reusing it slow and
unrewarding, make stolen copies stop working, keep the leaderboard trustworthy,
and give you clear legal ownership. That is what this release does.

## What the review found

| # | Finding | Risk | Status |
|---|---------|------|--------|
| 1 | The GitHub repository is **public**, so the full readable source and its entire commit history can be browsed, cloned and forked by anyone. | **Critical** for code theft | Needs your action (steps below) |
| 2 | The shared leaderboard accepted any score anyone posted, including impossible ones. | High (cheating) | Fixed: impossible scores are filtered out |
| 3 | Libraries were loaded from CDNs without integrity checks; a compromised CDN could have injected code. | Medium (supply chain) | Fixed: every library is hash-verified |
| 4 | No Content-Security-Policy; nothing limited where the page could load scripts from or send data to. | Medium | Fixed in the protected build |
| 5 | Anyone could rehost the game on their own site or embed it in an iframe as their own. | Medium (theft) | Fixed in the protected build: site lock and embed blocking |
| 6 | The code shipped readable, with meaningful names. | Medium (reverse engineering) | Fixed in the protected build: minified and obfuscated |
| 7 | No copyright or license, so ownership was unclear. | Medium (legal) | Fixed: LICENSE, notices in page, footer and console |
| 8 | One place built HTML from strings (`innerHTML`). It only used built-in text, but it is a pattern that leads to injection bugs. | Low | Fixed: built with safe DOM calls |
| 9 | Secrets in code (API keys, passwords, tokens) | None found | OK. Never add a Supabase `service_role` key or any private key. The `anon` key is designed to be public. |
| 10 | Debug or cheat hooks exposed on `window` | None found | OK. All game state lives inside a closure. |
| 11 | Player names shown on screen | Safe | All names are inserted as plain text, never as HTML, so typed names cannot run code. |
| 12 | Personal best and coins are kept in the player's own browser storage | Low | A player can only change their own device's numbers; the shared leaderboard re-checks every score. |

## What was implemented

**In the game source (both the claude.ai version and the GitHub build)**
- **Verified libraries.** three.js, MQTT and Supabase now load from jsDelivr with Subresource Integrity hashes. If a CDN ever serves a modified file, the browser refuses to run it.
- **Leaderboard anti-cheat.** Every entry records how long the run lasted. A score only reaches the board if it is achievable in that time (at most 230 points per second plus the 3,600 maximum bonus, and a matching distance), and a "clocked out" flag requires a full shift. Older entries without a run time are capped at 25,000. This is checked when scores are sent *and* when they are received, so a cheater's fake entries never show up on anyone's podium.
- **Official-site lock (hook).** The code can refuse to run anywhere except approved addresses. It is switched off in the source and switched on by the build script.
- **Safe rendering.** The last `innerHTML` use was replaced with safe DOM building.
- **Ownership.** Copyright notice at the top of the file, in the start screen footer and in the browser console.

**Only in the protected GitHub build (`public/index.html`)**
- **Minified and obfuscated** with terser and javascript-obfuscator: names replaced with hex codes, strings moved into an encoded table, comments removed, and self-defending code that stops working if someone reformats it to read it. Heavy options that slow down the 60 fps game loop (control-flow flattening, dead code) are deliberately off; frame rate was measured the same as the readable version.
- **Site lock on.** It only runs on `akshygarg.github.io` (plus `localhost` and opened-from-disk for your own testing). Anywhere else, players see "This copy of the game isn't authorized" with a link to the official game.
- **Embed blocking.** If another website puts the game inside an iframe, it shows the same message instead of the game.
- **Content-Security-Policy.** Scripts may only come from the page itself and jsDelivr; network connections only to the leaderboard and live-player servers; plugins, `<base>` tag tricks and form submissions are blocked.
- **Referrer policy** so the full page address isn't leaked to other sites.

## Tested

- Official address: game loads, plays, live players and leaderboard connect, no security-policy errors, same frame rate as the readable version.
- Rehosted on another domain: shows the "not authorized" screen.
- Embedded in another site's iframe: shows the "not authorized" screen.
- A fake leaderboard with 99,999 points, and 40,000 points in a 20-second run, was posted to the shared channel: both were ignored and the real top score stayed on the podium.

## What you need to do on GitHub (most important)

Right now anyone can read your original source on GitHub, including every old version in the history. Obfuscating the live file does not help while the readable original is public. Choose one:

**Option A (free, recommended): split source and release**
1. Create a new **private** repository (for example `escape-manager-source`) and put the contents of `source/` and `tools/` in it. This is where you edit the game.
2. Create a **new public** repository for the website and upload only `public/index.html` and `public/LICENSE`. Turn on GitHub Pages for it.
3. Delete the old public repository (Settings, then Danger zone), or make it private. Deleting is the only way to remove the readable versions from its history. Anyone who already cloned or forked it keeps their copy; the license still protects you legally.
4. If the new repository name differs from `escape_manager_game`, update `SITE.home` in `tools/protect.mjs` and rebuild.

**Option B: keep one repository**
Replace `index.html` with `public/index.html`, add `LICENSE`, and keep the readable source only on your computer. The old readable versions stay visible in the commit history unless you rewrite it (`git filter-repo`) and force-push, which still does not affect existing forks.

## Rebuilding after you change the game

1. Edit `source/escape-the-manager.source.html` (never edit the obfuscated file).
2. In the `tools` folder: `npm install` once, then `npm run build`.
3. Upload the new `public/index.html`.

## Remaining risks and next steps

- **The leaderboard is still not tamper-proof.** The anti-cheat blocks impossible scores, but someone who studies the game can still post a believable fake score, because there is no server checking runs. For a fully trusted leaderboard, move it to a server you control (for example Supabase with row-level security and an Edge Function that validates each run). On the claude.ai version, scores are stored per signed-in person and each person can only write their own entry.
- **The public live-player and leaderboard channel** (a free MQTT broker) is readable by anyone who finds it. It only carries nicknames, run status and scores. Don't put anything private in nicknames.
- **Obfuscation is a deterrent, not a lock.** It turns hours of reading into weeks. Your license is what gives you legal recourse; GitHub responds to DMCA takedown requests against copies of your work.
- **Security headers like `frame-ancestors`** can't be set on GitHub Pages. If you later move to Cloudflare Pages, Netlify or Vercel (all free, and all can deploy from a private repository), add real HTTP headers for even stronger protection.
