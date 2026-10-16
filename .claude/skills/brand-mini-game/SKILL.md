---
name: brand-mini-game
description: Build a small browser mini-game (single self-contained HTML file) that fits a specific brand or company — triggered by requests like "うちの会社らしいゲーム作って", "make a game that feels like [company]", "ブランドらしいミニゲーム", or any ask for a playable game/toy tied to a business, product, or local identity. Also use this whenever a game needs to be playable immediately (before a PR merges) via a Claude Artifact, or when a hand-drawn SVG illustration needs to be handed off to an external image generator (Codex, Midjourney, etc.) and the result integrated back. Push for this skill even if the user just says "ゲーム作って" / "make a game" inside a company repo — don't default to a generic arcade clone.
---

# Brand Mini-Game

Build a small browser game that could only belong to *this* brand — not a
generic template with the company's name swapped in. The mechanic, the
visual language, and the copy should all come from something true about the
business: its industry, its history, its location, its products. A fugu
wholesaler gets a game about appraising fish, not a reskinned Flappy Bird.

## Why this order matters

Each step below exists because skipping it produced a visible problem the
first time this workflow ran. Follow the order; don't jump straight to
writing HTML.

## 1. Ground the concept in FACT, not invention

Before designing anything, read the actual repo/site for who this business
is: company name, industry, location, history, founding date, family
generation, related pages, existing brand voice. Use Grep/Read across the
repo (index.html, About pages, footer copy, meta descriptions) rather than
guessing. Things worth hunting for specifically: a tagline or history blurb,
an address (tells you region/culture to draw on), any "N年続く" or "N代目"
style lineage claim, and links to sibling sites/pages (they often reveal the
brand's full portfolio, not just the one page you started from).

Do not invent specific facts (certifications, exact figures, named
achievements) — flavor text and fictional game mechanics are fine, but
anything presented as a real claim about the business must come from what
you actually found in the repo. If the user has stated personal editorial
preferences (e.g. a FACT/VOICE/IDEA/PLAN/UNKNOWN discipline) elsewhere in
the conversation, hold the game's marketing copy to that same bar.

## 2. Pick ONE mechanic that only fits this brand

Brainstorm briefly, then commit to a single simple mechanic that maps onto
something the business actually does or is known for — catch/sort, match,
timing, a small quiz, a build-up loop. Simple and polished beats ambitious
and half-finished: a 60-second catch game with a clean scoring/rank system
reads as more "finished" than a multi-level platformer that's rough
everywhere.

Sketch this in 2-3 sentences before writing code:
- What does the player do, moment to moment?
- What's the win/lose condition?
- What one visual detail could only belong to this brand? (a product, a
  local landmark, a mascot built from the product itself)

## 3. Build as a single self-contained HTML file

Inline CSS and JS in one file, minimal external dependencies. Google Fonts
via `<link>` is fine and matches what most brand sites already load. Keep
game state in plain JS closures — no build step, no framework, so the file
can be dropped straight into a static site (GitHub Pages and similar) and
also published as a Claude Artifact unchanged (see step 5).

If the repo has an existing design system (colors, fonts, a `:root` token
block in an existing page), reuse those tokens so the game reads as part of
the site, not a bolted-on toy. If the user explicitly asks for a different
visual direction (a reference screenshot, "make it feel like an RPG title
screen"), treat that as an art-direction brief and build a *new* deliberate
single-theme token system for the game — see `references/design-notes.md`
for the washi/scroll-RPG palette and layout patterns that worked well last
time, as a starting point rather than a template to copy verbatim.

## 4. Verify locally before showing anyone

Start a local static server and drive a real headless browser — don't just
eyeball the source.

```bash
python3 -m http.server 8793 &
```

Playwright is available as a **global npm package**, not a Python package —
`pip install playwright` / `python3 -c "import playwright"` will fail with
`ModuleNotFoundError`. Use the Node global instead:

```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

**Gotcha — mojibake when test-loading an Artifact-shaped fragment.** If the
file is written in Artifact format (see step 5: no `<!DOCTYPE>`/`<html>`/
`<head>`/`<body>`, no `<meta charset>`), loading it directly from a plain
`http.server` renders Japanese text as garbage glyphs, because nothing
declares the encoding — the real Artifact platform adds that meta tag when
it wraps the page, but your local test server doesn't. Don't panic and
rewrite the CSS; wrap the fragment in a minimal shell before testing:

```html
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><!-- paste fragment here --></body></html>
```

Take one screenshot of the start screen and one mid-gameplay (click the
start button, wait ~2s, screenshot again). That's enough to catch layout
breaks, encoding issues, and dead buttons without turning this into a
screenshot-tweak loop.

## 5. Publish an instantly-playable Artifact first

Don't make the user wait for a PR to merge before they can play. Publish
the game as a Claude Artifact right after it works locally:

- Load the `artifact-design` skill before this step if the visual bar
  matters (the user said so, or the game is meant to be shown around) — it
  governs the token-system approach referenced in step 3.
- Artifact format strips the outer `<!DOCTYPE>`/`<html>`/`<head>`/`<body>` —
  write `<title>`, `<style>`, and the body content directly; the platform
  wraps it.
- Give it a real 2-4 word name as `<title>` (not "X Game" — see the
  Artifact tool's title rules), a one-sentence `description`, and one emoji
  `favicon`.
- On every re-publish, pass the same `url` back so it updates in place
  instead of spawning a new link.

## 6. Mirror the same build into the repo

Copy the same visual/gameplay content into a full standalone HTML file
(with `<!DOCTYPE>`, `<html>`, `<head>` including `<meta charset="UTF-8">`,
page `<title>`, OG tags matching the site's convention) so it works as a
normal page on the site once deployed. Differences from the Artifact
version are typically just: full head boilerplate, and a back-link into the
site's actual navigation (footer, related-pages list) if one exists — add
the game to that list so it's discoverable, matching the existing markup
pattern rather than inventing a new one.

## 7. Commit, push, and say what's playable where

Commit with a message describing what the game does and why (not "add
game.html"). Push to the working branch. Tell the user two things clearly:
the Artifact link they can play right now, and that the repo version will
go live once merged/deployed (name the actual deploy mechanism if you found
one — GitHub Pages, a CNAME file, etc.). Only open a PR if asked.

## When the user wants better art than you can draw

This environment's connected tools (Adobe Creative Cloud tools, Canva) are
**editing and layout tools, not text-to-image generators** — there is
typically no "generate an image from this prompt" primitive available, only
tools that crop/adjust/mask *existing* images or assemble marketing
templates. Don't assume Adobe/Canva/Firefly access means you can produce a
custom illustration from a text prompt; check what's actually callable
before promising it, and say plainly if it isn't there.

When the user wants higher-fidelity art than hand-drawn inline SVG can
deliver and asks to use an external tool (Codex, ChatGPT image, Midjourney,
etc.) themselves:

1. Improve the hand-drawn SVG as far as you reasonably can first — it's
   often "good enough" and costs nothing to iterate on.
2. If they still want external generation, write them a **copy-pasteable
   brief**: the scene description, art style, an explicit hex color
   palette pulled from your actual CSS tokens (so the result will actually
   match), and exact output specs (dimensions, aspect ratio, format,
   transparency if it's a standalone character/prop). Deliver it as a file
   via the user-file-delivery tool so it's easy to copy elsewhere.
3. Tell them explicitly: attach the resulting image(s) back into this same
   chat and you'll integrate them — no special filename or path needed.

See `references/codex-handoff-template.md` for the exact brief structure
that worked well, ready to adapt.

## Keep the copy short and match the user's language

Status updates to the user should be brief: what changed, what's playable
where, what's next. Don't narrate every intermediate step (screenshot
taken, server started) — those are working details, not results.
